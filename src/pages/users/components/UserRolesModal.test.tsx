import { afterEach, beforeAll, expect, jest, test } from '@jest/globals';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { App } from 'antd';
import React from 'react';
import { getAllDeviceGroups } from '@/services/rustdesk-console/deviceGroup';
import { getPermissionList } from '@/services/rustdesk-console/permission';
import { getRoleList } from '@/services/rustdesk-console/role';
import {
  getUserRoles,
  replaceUserRoles,
} from '@/services/rustdesk-console/userRole';
import UserRolesModal from './UserRolesModal';

jest.mock('@umijs/max', () => {
  const intl = {
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) =>
      defaultMessage,
  };
  return {
    FormattedMessage: ({ defaultMessage }: { defaultMessage: string }) =>
      defaultMessage,
    useIntl: () => intl,
  };
});
jest.mock('@/services/rustdesk-console/deviceGroup', () => ({
  getAllDeviceGroups: jest.fn(),
}));
jest.mock('@/services/rustdesk-console/permission', () => ({
  getPermissionList: jest.fn(),
}));
jest.mock('@/services/rustdesk-console/role', () => ({
  getRoleList: jest.fn(),
}));
jest.mock('@/services/rustdesk-console/userRole', () => ({
  getUserRoles: jest.fn(),
  replaceUserRoles: jest.fn(),
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test('catalog load failure stays visible and cannot submit assignments', async () => {
  jest.mocked(getRoleList).mockResolvedValue({ data: [], total: 0 });
  jest.mocked(getAllDeviceGroups).mockResolvedValue([]);
  jest.mocked(getUserRoles).mockResolvedValue({
    data: [],
    effective_scope: {},
  });
  jest
    .mocked(getPermissionList)
    .mockRejectedValue(new Error('catalog unavailable'));

  render(
    React.createElement(
      App,
      null,
      React.createElement(UserRolesModal, {
        open: true,
        user: {
          guid: 'user-guid',
          name: 'user',
          email: 'user@example.com',
          note: '',
          status: 1,
          is_admin: false,
        },
        onOpenChange: jest.fn(),
      }),
    ),
  );

  await waitFor(() =>
    expect(screen.getByText('Failed to load user roles')).not.toBeNull(),
  );
  const saveButton = screen.getByRole('button', { name: 'Save' });
  expect((saveButton as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(saveButton);
  expect(replaceUserRoles).not.toHaveBeenCalled();
});
