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
import { getPermissionList } from '@/services/rustdesk-console/permission';
import { getRoleList } from '@/services/rustdesk-console/role';
import {
  getUserRoleEligibility,
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
jest.mock('@/services/rustdesk-console/permission', () => ({
  getPermissionList: jest.fn(),
}));
jest.mock('@/services/rustdesk-console/role', () => ({
  getRoleList: jest.fn(),
}));
jest.mock('@/services/rustdesk-console/userRole', () => ({
  getUserRoleEligibility: jest.fn(),
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
  jest.mocked(getUserRoles).mockResolvedValue({
    data: [],
    effective_scope: {},
  });
  jest.mocked(getUserRoleEligibility).mockResolvedValue({ data: [] });
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

test('owner is shown as a virtual full-authority identity, not custom assignments', async () => {
  jest.mocked(getRoleList).mockResolvedValue({
    data: [
      {
        guid: 'custom-role',
        name: 'Custom role',
        note: '',
        permissions: ['users.view'],
        created_at: '',
        updated_at: '',
      },
    ],
    total: 1,
  });
  jest.mocked(getUserRoles).mockResolvedValue({
    data: [
      {
        guid: 'assignment-guid',
        role_guid: 'custom-role',
        role_name: 'Custom role',
        scope_type: 'global',
        device_group_guids: [],
        permissions: ['users.view'],
        created_at: '',
        updated_at: '',
      },
    ],
    effective_scope: {},
  });
  jest.mocked(getUserRoleEligibility).mockResolvedValue({ data: [] });
  jest.mocked(getPermissionList).mockResolvedValue({
    data: [
      {
        code: 'users.view',
        resource: 'users',
        action: 'view',
        name: 'View users',
        description: '',
        scope: 'global',
      },
    ],
  });

  render(
    React.createElement(
      App,
      null,
      React.createElement(UserRolesModal, {
        open: true,
        user: {
          guid: 'owner-guid',
          name: 'owner',
          email: 'owner@example.com',
          note: '',
          status: 1,
          is_admin: true,
        },
        onOpenChange: jest.fn(),
      }),
    ),
  );

  await waitFor(() =>
    expect(screen.getByText('System capabilities')).not.toBeNull(),
  );
  expect(screen.queryByText('Role 1')).toBeNull();
  expect(screen.getByText('Unknown permission')).not.toBeNull();
  expect(replaceUserRoles).not.toHaveBeenCalled();
});

test('ordinary users keep real eligibility-backed assignments and no-role scope', async () => {
  jest.mocked(getRoleList).mockResolvedValue({
    data: [
      {
        guid: 'role-guid',
        name: 'Operator',
        note: '',
        permissions: ['devices.view'],
        created_at: '',
        updated_at: '',
      },
    ],
    total: 1,
  });
  jest.mocked(getUserRoles).mockResolvedValue({
    data: [],
    effective_scope: {},
  });
  jest.mocked(getUserRoleEligibility).mockResolvedValue({
    data: [
      {
        guid: 'role-guid',
        name: 'Operator',
        protected_account: false,
        assigned: false,
        can_assign: true,
        can_remove: true,
        allowed_scope_types: ['global', 'device_group'],
        assignable_device_groups: [{ guid: 'group-guid', name: 'Group' }],
        reason_code: null,
      },
    ],
  });
  jest.mocked(getPermissionList).mockResolvedValue({
    data: [
      {
        code: 'devices.view',
        resource: 'devices',
        action: 'view',
        name: 'View devices',
        description: '',
        scope: 'global',
      },
    ],
  });

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

  await waitFor(() => expect(screen.getByText('Add role')).not.toBeNull());
  expect(screen.queryByText('System capabilities')).toBeNull();
  expect(getUserRoleEligibility).toHaveBeenCalledWith('user-guid');
});
