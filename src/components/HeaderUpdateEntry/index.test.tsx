import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { request, useAccess } from '@umijs/max';
import React from 'react';
import en from '@/locales/en-US/pwa';
import {
  capability,
  installationId,
  job,
  jobId,
  plan,
} from '@/services/rustdesk-console/systemUpdate.testFixtures';
import { saveUpdate } from '@/services/rustdesk-console/systemUpdate';
import HeaderUpdateEntry from './index';

jest.mock('@umijs/max', () => ({
  request: jest.fn(),
  history: { push: jest.fn() },
  useAccess: jest.fn(),
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) =>
      jest.requireActual<{ default: Record<string, string> }>(
        '@/locales/en-US/pwa',
      ).default[id] || id,
  }),
  getIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) =>
      defaultMessage,
  }),
}));
jest.mock('@/utils/auth', () => ({ getToken: () => 'test-token' }));
jest.mock('@/components/UpdateCheckModal', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
      open
        ? R.createElement(
            'div',
            { role: 'dialog' },
            R.createElement(
              'button',
              { onClick: onClose, 'aria-label': 'Close' },
              '×',
            ),
          )
        : null,
  };
});
jest.mock('antd', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return {
    Tooltip: ({ children, title }: any) =>
      R.createElement('span', { title }, children),
    message: { error: jest.fn() },
    notification: { open: jest.fn() },
  };
});

const requestMock = jest.mocked<(url: string) => Promise<unknown>>(request);
const accessMock = jest.mocked<() => { isSuperAdmin: boolean }>(useAccess);
let nextPlan = plan({}, 'noUpdates');
let nextCapability = capability();
let current: import('@/services/rustdesk-console/systemUpdate').JobView | null =
  null;
const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  Object.defineProperty(globalThis, 'FRONTEND_VERSION', {
    value: '1.6.0',
    configurable: true,
  });
  accessMock.mockReturnValue({ isSuperAdmin: true });
  nextPlan = plan({}, 'noUpdates');
  nextCapability = capability();
  current = null;
  requestMock.mockImplementation(async (url) => {
    if (url.endsWith('/capabilities')) return nextCapability;
    if (url.endsWith('/jobs/current')) return { installationId, job: current };
    if (url.endsWith('/plans')) return nextPlan;
    if (url.endsWith(`/${jobId}`)) return current;
    return {};
  });
});
afterEach(cleanup);

test('only an administrator probes update readiness and sees an icon-only entry', async () => {
  accessMock.mockReturnValue({ isSuperAdmin: false });
  const view = render(React.createElement(HeaderUpdateEntry));
  await settle();
  expect(view.queryByRole('button')).toBeNull();
  expect(requestMock).not.toHaveBeenCalled();
  accessMock.mockReturnValue({ isSuperAdmin: true });
  view.rerender(React.createElement(HeaderUpdateEntry));
  await settle();
  const button = view.getByRole('button', {
    name: en['app.systemUpdate.check'],
  });
  expect(button.textContent).toBe('');
  expect(button.querySelector('svg[data-icon=info-circle]')).toBeTruthy();
  expect(view.queryByRole('dialog')).toBeNull();
  expect(requestMock.mock.calls.map((call) => call[0])).toEqual([
    '/api/system-update/capabilities',
    '/api/system-update/jobs/current',
    '/api/system-update/plans',
  ]);
});

test('an executable plan drives the upgrade icon without legacy data or job submission', async () => {
  nextPlan = plan();
  const view = render(React.createElement(HeaderUpdateEntry));
  await settle();
  const button = view.getByRole('button', {
    name: en['app.systemUpdate.available'],
  });
  expect(button.querySelector('svg[data-icon=upgrade]')).toBeTruthy();
  expect(view.queryByRole('dialog')).toBeNull();
  expect(
    requestMock.mock.calls.some(
      (call) => call[0] === '/api/update-check' || call[0].endsWith('/jobs'),
    ),
  ).toBe(false);
  fireEvent.click(button);
  await settle();
  expect(view.getAllByRole('dialog')).toHaveLength(1);
});

test.each(['blocked', 'noUpdates'] as const)(
  '%s never advertises an executable update',
  async (example) => {
    nextPlan = plan({}, example);
    const view = render(React.createElement(HeaderUpdateEntry));
    await settle();
    expect(
      view.getByRole('button', { name: en['app.systemUpdate.check'] }),
    ).toBeTruthy();
    expect(
      view.queryByRole('button', { name: en['app.systemUpdate.available'] }),
    ).toBeNull();
    expect(view.queryByRole('dialog')).toBeNull();
  },
);

test('a missing capabilities endpoint keeps the entry without advertising or planning an update', async () => {
  requestMock.mockRejectedValue({ response: { status: 404 } });
  const view = render(React.createElement(HeaderUpdateEntry));
  await settle();
  fireEvent.click(
    view.getByRole('button', { name: en['app.systemUpdate.check'] }),
  );
  await settle();
  expect(view.getByRole('dialog')).toBeTruthy();
  expect(
    requestMock.mock.calls.some((call) => call[0].endsWith('/plans')),
  ).toBe(false);
});

test('opening again refreshes actual installation facts without extra release-check controls', async () => {
  nextPlan = plan();
  const view = render(React.createElement(HeaderUpdateEntry));
  await settle();
  fireEvent.click(
    view.getByRole('button', { name: en['app.systemUpdate.available'] }),
  );
  await settle();
  expect(view.queryByRole('button', { name: /Recheck$/ })).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Close' }));
  expect(view.queryByRole('dialog')).toBeNull();
  nextPlan = plan({}, 'noUpdates');
  fireEvent.click(
    view.getByRole('button', { name: en['app.systemUpdate.available'] }),
  );
  await settle();
  expect(
    view.getByRole('button', { name: en['app.systemUpdate.check'] }),
  ).toBeTruthy();
  expect(
    requestMock.mock.calls.filter((call) => call[0].endsWith('/capabilities')),
  ).toHaveLength(3);
});

test('clicking during an initial readiness check shares its pending request', async () => {
  const implementation = requestMock.getMockImplementation();
  if (!implementation) throw new Error('Missing request fixture');
  let finish: (result: unknown) => void = () => undefined;
  requestMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(React.createElement(HeaderUpdateEntry));
  const button = view.getByRole('button', {
    name: en['app.systemUpdate.checkingUpdates'],
  });
  expect(button.getAttribute('aria-busy')).toBe('true');
  fireEvent.click(button);
  await settle();
  expect(view.getByRole('dialog')).toBeTruthy();
  expect(requestMock).toHaveBeenCalledTimes(1);
  await act(async () => finish(capability()));
  await settle();
  expect(
    view
      .getByRole('button', { name: en['app.systemUpdate.check'] })
      .getAttribute('aria-busy'),
  ).toBe('false');
  expect(
    requestMock.mock.calls.filter((call) => call[0].endsWith('/capabilities')),
  ).toHaveLength(1);
});

test('a saved active task resumes the same job, without a new plan or update badge', async () => {
  saveUpdate({ installationId, jobId });
  current = job();
  const view = render(React.createElement(HeaderUpdateEntry));
  await settle();
  expect(view.getByRole('dialog')).toBeTruthy();
  expect(
    view.queryByRole('button', { name: en['app.systemUpdate.available'] }),
  ).toBeNull();
  expect(
    requestMock.mock.calls.some(
      (call) => call[0].endsWith('/plans') || call[0].endsWith('/jobs'),
    ),
  ).toBe(false);
});
