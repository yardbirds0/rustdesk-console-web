import { beforeEach, expect, jest, test } from '@jest/globals';
import { request } from '@umijs/max';
import { checkUpdate } from './system';

jest.mock('@umijs/max', () => ({ request: jest.fn() }));

const requestMock = jest.mocked(request);

beforeEach(() => {
  requestMock.mockReset();
  requestMock.mockResolvedValue({});
});

test('checks updates with the backend GET/query contract', async () => {
  const params = { frontend_version: '1.2.3' };

  await checkUpdate(params);

  expect(requestMock).toHaveBeenCalledWith('/api/update-check', {
    method: 'GET',
    params,
  });
});
