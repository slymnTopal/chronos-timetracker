// @flow
import * as eff from 'redux-saga/effects';
import * as Sentry from '@sentry/electron';
import moment from 'moment';
import {
  remote,
} from 'electron';

import config from 'config';

import type {
  Id,
} from 'types';

import {
  uiActions,
  updaterActions,
  actionTypes,
} from 'actions';
import {
  getIssueWorklogs,
} from 'selectors';

import {
  issueSelectFlow,
} from './issues';
import {
  chronosApiAuth,
} from './initialize';


const LOG_LEVELS = {
  info: 'info',
  log: 'log',
  error: 'error',
  warn: 'warn',
};

const mutedText: string = 'color: #888; font-weight: 100;';

const LOG_STYLE = {
  info: 'color: white; background: blue;',
  log: 'color: white; background: magenta;',
  error: 'color: white; background: red;',
  warn: 'color: white; background: orange;',
};

export function* infoLog(...argw: any): Generator<*, void, *> {
  if (config.infoLog) {
    const level = LOG_LEVELS.info;
    yield eff.call(
      console.groupCollapsed,
      `%c log %c ${level} %c ${argw[0]} %c @ ${moment().format('hh:mm:ss')}`,
      mutedText,
      LOG_STYLE[level],
      'color: black;',
      mutedText,
    );
    yield eff.call(console[level], ...argw);
    yield eff.call(console.groupEnd);
  }
}

export function throwError(err) {
  console.error(err);
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(err);
  }
}

/* eslint-disable */
function uuidv4() {
  // $FlowFixMe
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    // $FlowFixMe
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
}
/* eslint-enable */

function* autoDeleteFlag(id) {
  yield eff.delay(5 * 1000);
  yield eff.put(uiActions.deleteFlag(id));
}

export function* notify({
  description = '',
  title = '',
  actions = [],
  appearance = 'normal',
  icon = 'bellIcon',
  resourceType,
  request,
  spinnerTitle = '',
  type,
  autoDelete = true,
}: {
  description?: string,
  title?: string,
  actions?: Array<any>,
  appearance?: string,
  icon?: string,
  resourceType? : string,
  request?: string,
  spinnerTitle?: string,
  type?: string,
  autoDelete?: boolean,
}): Generator<*, void, *> {
  const newFlag = {
    id: uuidv4(),
    title,
    actions,
    appearance,
    description,
    icon,
    resourceType,
    request,
    spinnerTitle,
    type,
  };
  yield eff.put(uiActions.addFlag(newFlag));
  if (autoDelete) {
    yield eff.fork(autoDeleteFlag, newFlag.id);
  }
}

export function* scrollToIndexRequest({
  worklogId,
  issueId,
}: {
  worklogId: Id,
  issueId: Id,
}): Generator<*, *, *> {
  try {
    const worklogs = yield eff.select(getIssueWorklogs(issueId));
    yield eff.put(uiActions.setUiState({
      issueViewWorklogsScrollToIndex: (
        worklogs.findIndex(w => worklogId === w.id)
      ),
    }));
  } catch (err) {
    throwError(err);
  }
}

export function* watchScrollToIndexRequest(): Generator<*, *, *> {
  yield eff.takeEvery(
    actionTypes.ISSUE_WORKLOGS_SCROLL_TO_INDEX_REQUEST,
    scrollToIndexRequest,
  );
}

function* onUiChange({
  payload: {
    keyOrRootValues,
    maybeValues,
  },
}): Generator<*, *, *> {
  try {
    const [
      values,
      keys,
    ] = (
      maybeValues === undefined
        ? [
          keyOrRootValues,
          Object.keys(keyOrRootValues),
        ]
        : [
          {
            [keyOrRootValues]: maybeValues,
          },
          [keyOrRootValues],
        ]
    );
    if (
      keys.includes('screenshotsEnabled')
      && values.screenshotsEnabled === true
    ) {
      yield eff.fork(chronosApiAuth);
    }
    if (keys.includes('selectedIssueId')) {
      yield eff.fork(
        issueSelectFlow,
        values.selectedIssueId,
      );
    }
    if (
      keys.includes('trayShowTimer')
      && values.trayShowTimer === false
    ) {
      remote.getGlobal('tray').setTitle('');
    }
    if (
      keys.includes('updateAutomatically')
      && values.updateAutomatically === true
    ) {
      yield eff.put(uiActions.setUiState({
        updateAvailable: null,
      }));
      yield eff.put(updaterActions.checkUpdates());
    }

    if (keys.includes('updateChannel')) {
      yield eff.put(uiActions.setUiState({
        updateAvailable: null,
      }));
      yield eff.put(updaterActions.checkUpdates());
    }
  } catch (err) {
    throwError(err);
  }
}

export function* takeUiStateChange(): Generator<*, *, *> {
  yield eff.takeEvery(actionTypes.SET_UI_STATE, onUiChange);
}
