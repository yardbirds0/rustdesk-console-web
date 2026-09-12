import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  jest,
  test,
} from '@jest/globals';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { App } from 'antd';
import React from 'react';
import { getPermissionList } from '@/services/rustdesk-console/permission';
import {
  createRole,
  deleteRole,
  getRoleDetail,
  getRoleList,
  getRoleProtectionImpact,
  updateRole,
} from '@/services/rustdesk-console/role';
import RoleList from './index';

let mockIsSuperAdmin = true;

const translatedMessages: Record<string, string> = {
  'pages.roles.view': 'View role',
  'pages.roles.resource.system': 'System capabilities',
  'pages.users.systemCapability.settings.manage': 'Manage system settings',
  'pages.users.systemCapability.device_groups.manage':
    'Manage device-group structure',
  'pages.users.systemCapability.identity_sources.manage':
    'Manage identity sources',
  'pages.common.close': 'Close',
};

jest.mock('@umijs/max', () => ({
  FormattedMessage: ({
    id,
    defaultMessage,
  }: {
    id: string;
    defaultMessage: string;
  }) => translatedMessages[id] || defaultMessage,
  useAccess: () => ({ isSuperAdmin: mockIsSuperAdmin }),
  useIntl: () => ({
    formatMessage: ({
      id,
      defaultMessage,
    }: {
      id: string;
      defaultMessage: string;
    }) => translatedMessages[id] || defaultMessage,
  }),
}));

jest.mock('@ant-design/pro-components', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    PageContainer: ({ children }: { children: any }) => children,
    ProTable: (props: {
      columns: Array<{
        valueType?: string;
        render?: (...args: unknown[]) => any;
      }>;
      request: (params: {
        current: number;
        pageSize: number;
      }) => Promise<{ data?: API.RoleItem[] }>;
      toolBarRender?: () => any[];
    }) => {
      const [rows, setRows] = ReactModule.useState<API.RoleItem[]>([]);
      const requested = ReactModule.useRef(false);
      ReactModule.useEffect(() => {
        if (requested.current) return;
        requested.current = true;
        void props
          .request({ current: 1, pageSize: 20 })
          .then((result) => setRows(result.data || []));
      }, [props]);
      const actionColumn = props.columns.find(
        (column) => column.valueType === 'option',
      );
      return ReactModule.createElement(
        'div',
        null,
        ...(props.toolBarRender?.() || []),
        ...rows.map((row) =>
          ReactModule.createElement(
            'div',
            { key: row.guid, 'data-testid': `role-row-${row.guid}` },
            ReactModule.createElement('span', null, row.name),
            actionColumn?.render?.(undefined, row),
          ),
        ),
      );
    },
  };
});

jest.mock('@/services/rustdesk-console/permission', () => ({
  getPermissionList: jest.fn(),
}));

jest.mock('@/services/rustdesk-console/role', () => ({
  createRole: jest.fn(),
  deleteRole: jest.fn(),
  getRoleDetail: jest.fn(),
  getRoleList: jest.fn(),
  getRoleProtectionImpact: jest.fn(),
  updateRole: jest.fn(),
}));

const permissionCatalog: API.PermissionItem[] = [
  {
    code: 'users.view',
    resource: 'users',
    action: 'view',
    name: 'View users',
    description: '',
    assignable: true,
    system_only: false,
    scope: 'global',
  },
  {
    code: 'devices.view',
    resource: 'devices',
    action: 'view',
    name: 'View devices',
    description: '',
    assignable: true,
    system_only: false,
    scope: 'device_group',
  },
  {
    code: 'address_books.view',
    resource: 'address_books',
    action: 'view',
    name: 'View shared address book settings',
    description: '',
    assignable: true,
    system_only: false,
    scope: 'global',
  },
  {
    code: 'roles.view',
    resource: 'roles',
    action: 'view',
    name: 'View roles',
    description: '',
    assignable: true,
    system_only: false,
    scope: 'global',
  },
  ...(['create', 'edit', 'delete'] as const).map((action) => ({
    code: `roles.${action}`,
    resource: 'roles',
    action,
    name: `${action[0].toUpperCase()}${action.slice(1)} roles`,
    description: '',
    assignable: false,
    system_only: true,
    scope: 'global' as const,
  })),
];

const customRole: API.RoleItem = {
  guid: 'custom-role',
  name: 'Operator',
  note: 'Device operations',
  permissions: ['devices.view'],
  protected_account: false,
  member_count: 0,
  created_at: '',
  updated_at: '',
};

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

beforeEach(() => {
  mockIsSuperAdmin = true;
  jest.mocked(getPermissionList).mockResolvedValue({ data: permissionCatalog });
  jest.mocked(getRoleList).mockResolvedValue({ data: [customRole], total: 1 });
  jest.mocked(getRoleDetail).mockResolvedValue(customRole);
  jest.mocked(createRole).mockResolvedValue(customRole);
  jest.mocked(updateRole).mockResolvedValue(customRole);
  jest.mocked(deleteRole).mockResolvedValue(undefined);
  jest.mocked(getRoleProtectionImpact).mockResolvedValue({
    guid: customRole.guid,
    protected_account: false,
    affected_member_count: 0,
  });
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

async function renderRoleList() {
  render(React.createElement(App, null, React.createElement(RoleList)));
  await screen.findByTestId('role-row-builtin.ordinary-user');
}

function expectReadOnlyRoleForm(dialog: HTMLElement) {
  expect(
    (within(dialog).getByLabelText('Role Name') as HTMLInputElement).disabled,
  ).toBe(true);
  expect(
    (within(dialog).getByLabelText('Note') as HTMLTextAreaElement).disabled,
  ).toBe(true);
  expect(
    (within(dialog).getByRole('combobox') as HTMLInputElement).disabled,
  ).toBe(true);

  const checkboxes = [...dialog.querySelectorAll('.ant-tree-checkbox')];
  expect(checkboxes.length).toBeGreaterThan(0);
  expect(
    checkboxes.every((checkbox) =>
      checkbox.classList.contains('ant-tree-checkbox-disabled'),
    ),
  ).toBe(true);

  const footer = dialog.querySelector('.ant-modal-footer');
  expect(footer).not.toBeNull();
  expect(within(footer as HTMLElement).getAllByRole('button')).toHaveLength(1);
  expect(
    within(footer as HTMLElement).getByRole('button', { name: 'Close' }),
  ).toBeTruthy();
}

function expectNoRoleMutations() {
  expect(createRole).not.toHaveBeenCalled();
  expect(updateRole).not.toHaveBeenCalled();
  expect(deleteRole).not.toHaveBeenCalled();
  expect(getRoleProtectionImpact).not.toHaveBeenCalled();
}

test('ordinary built-in role uses the shared disabled form and only basic address-book capability', async () => {
  await renderRoleList();

  fireEvent.click(
    within(screen.getByTestId('role-row-builtin.ordinary-user')).getByRole(
      'button',
      { name: /View role$/ },
    ),
  );

  const dialog = await screen.findByRole('dialog');
  await waitFor(() =>
    expect(
      (within(dialog).getByLabelText('Role Name') as HTMLInputElement).value,
    ).toBe('Ordinary user'),
  );
  expect(within(dialog).getByText('View role')).toBeTruthy();
  expect(
    (within(dialog).getByLabelText('Note') as HTMLTextAreaElement).value,
  ).toBe('Personal address book basic functionality only.');
  expect(within(dialog).getByText('Personal address book')).toBeTruthy();
  expect(within(dialog).getByText('Basic feature')).toBeTruthy();
  expect(within(dialog).queryByText('View devices')).toBeNull();
  expect(within(dialog).queryByText('Protected accounts')).toBeNull();
  expectReadOnlyRoleForm(dialog);
  expect(getRoleDetail).not.toHaveBeenCalled();
  expectNoRoleMutations();
});

test('super-administrator built-in role shows the complete checked catalog and system capabilities read-only', async () => {
  await renderRoleList();

  fireEvent.click(
    within(screen.getByTestId('role-row-builtin.super-admin')).getByRole(
      'button',
      { name: /View role$/ },
    ),
  );

  const dialog = await screen.findByRole('dialog');
  await waitFor(() =>
    expect(
      (within(dialog).getByLabelText('Role Name') as HTMLInputElement).value,
    ).toBe('Super administrator'),
  );
  for (const permission of permissionCatalog) {
    expect(within(dialog).getByText(permission.name)).toBeTruthy();
  }
  expect(within(dialog).getByText('Personal address book')).toBeTruthy();
  expect(within(dialog).getByText('Protected accounts')).toBeTruthy();

  for (const label of ['View devices', 'Create roles']) {
    const row = within(dialog).getByText(label).closest('.ant-tree-treenode');
    expect(row?.querySelector('.ant-tree-checkbox-checked')).toBeTruthy();
  }
  expectReadOnlyRoleForm(dialog);
  expect(getRoleDetail).not.toHaveBeenCalled();
  expectNoRoleMutations();
});

test('owner create and edit modes remain interactive and submit through their existing APIs', async () => {
  await renderRoleList();

  fireEvent.click(screen.getByRole('button', { name: /Create Role$/ }));
  let dialog = await screen.findByRole('dialog');
  const createName = within(dialog).getByLabelText(
    'Role Name',
  ) as HTMLInputElement;
  const createNote = within(dialog).getByLabelText(
    'Note',
  ) as HTMLTextAreaElement;
  expect(createName.disabled).toBe(false);
  expect(createNote.disabled).toBe(false);
  expect(
    (within(dialog).getByRole('combobox') as HTMLInputElement).disabled,
  ).toBe(false);
  fireEvent.change(createName, { target: { value: 'New role' } });
  fireEvent.change(createNote, { target: { value: 'New note' } });
  const createFooter = dialog.querySelector('.ant-modal-footer') as HTMLElement;
  fireEvent.click(
    within(createFooter).getAllByRole('button').at(-1) as HTMLElement,
  );

  await waitFor(() =>
    expect(createRole).toHaveBeenCalledWith({
      name: 'New role',
      note: 'New note',
      permissions: [],
      protected_account: false,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  fireEvent.click(
    within(screen.getByTestId('role-row-custom-role')).getByRole('button', {
      name: /Edit$/,
    }),
  );
  dialog = await screen.findByRole('dialog');
  await waitFor(() =>
    expect(
      (within(dialog).getByLabelText('Role Name') as HTMLInputElement).value,
    ).toBe('Operator'),
  );
  expect(getRoleDetail).toHaveBeenCalledWith('custom-role');
  const editName = within(dialog).getByLabelText(
    'Role Name',
  ) as HTMLInputElement;
  const editNote = within(dialog).getByLabelText('Note') as HTMLTextAreaElement;
  expect(editName.disabled).toBe(false);
  expect(editNote.disabled).toBe(false);
  fireEvent.change(editNote, { target: { value: 'Updated note' } });
  const editFooter = dialog.querySelector('.ant-modal-footer') as HTMLElement;
  fireEvent.click(
    within(editFooter).getAllByRole('button').at(-1) as HTMLElement,
  );

  await waitFor(() =>
    expect(updateRole).toHaveBeenCalledWith('custom-role', {
      name: 'Operator',
      note: 'Updated note',
      permissions: ['devices.view'],
      protected_account: false,
    }),
  );
});
