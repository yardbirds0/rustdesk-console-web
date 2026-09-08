import { expect, jest, test } from '@jest/globals';

jest.mock('@umijs/max', () => ({
  getIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) =>
      defaultMessage,
  }),
  history: { push: jest.fn() },
}));
jest.mock('antd', () => ({
  message: { error: jest.fn(), warning: jest.fn() },
  notification: { open: jest.fn() },
}));
jest.mock('@/utils/auth', () => ({
  getToken: jest.fn(),
  removeToken: jest.fn(),
}));

import { errorConfig, PERMISSIONS_STALE_EVENT } from './requestErrorConfig';

test('a 403 requests one permission refresh event without retrying the request', () => {
  const refresh = jest.fn();
  window.addEventListener(PERMISSIONS_STALE_EVENT, refresh);

  const handler = errorConfig.errorConfig?.errorHandler as (
    error: unknown,
    options: unknown,
  ) => void;
  handler({ response: { status: 403 } }, {});

  expect(refresh).toHaveBeenCalledTimes(1);
  window.removeEventListener(PERMISSIONS_STALE_EVENT, refresh);
});
