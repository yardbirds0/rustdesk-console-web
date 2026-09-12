import { expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { Tree } from 'antd';
import React from 'react';
import {
  buildRolePermissionTreeData,
  getAssignablePermissionPayload,
  getSystemCapabilityTreeKey,
} from './permissionTree';

const catalogCodes = [
  'users.view',
  'users.create',
  'users.edit',
  'users.status',
  'users.delete',
  'users.security',
  'users.force_logout',
  'user_groups.view',
  'user_groups.create',
  'user_groups.edit',
  'user_groups.delete',
  'user_groups.membership',
  'devices.view',
  'devices.edit',
  'devices.status',
  'devices.delete',
  'devices.disconnect',
  'address_books.view',
  'address_books.edit',
  'address_books.share',
  'strategies.view',
  'strategies.create',
  'strategies.edit',
  'strategies.delete',
  'strategies.assign',
  'audit.view',
  'roles.view',
  'roles.assign',
  'roles.create',
  'roles.edit',
  'roles.delete',
] as const;

const systemOnly = new Set(['roles.create', 'roles.edit', 'roles.delete']);
const labels: Record<string, string> = {
  'roles.view': 'View roles',
  'roles.assign': 'Assign roles',
  'roles.create': 'Create roles',
  'roles.edit': 'Edit roles',
  'roles.delete': 'Delete roles',
};

const completeCatalog: API.PermissionItem[] = catalogCodes.map((code) => ({
  code,
  resource: code.split('.')[0],
  action: code.split('.')[1],
  name: labels[code] || code,
  description: labels[code] || code,
  assignable: !systemOnly.has(code),
  system_only: systemOnly.has(code),
  scope: code.startsWith('devices.') ? 'device_group' : 'global',
}));

const formatMessage = ({
  id,
  defaultMessage,
}: {
  id: string;
  defaultMessage: string;
}) =>
  labels[id.replace('pages.roles.permission.', '')] ||
  {
    'pages.roles.resource.roles': 'Roles',
    'pages.roles.resource.system': 'System capabilities',
    'pages.roles.ownerOnly': 'Super administrator only',
    'pages.roles.personalAddressBook': 'Personal address book',
    'pages.roles.basicFunction': 'Basic feature',
    'pages.roles.protectedAccount': 'Protected accounts',
  }[id] ||
  defaultMessage;

test('renders the complete roles catalog with localized and assignability-aware rows', () => {
  render(
    <Tree
      checkable
      defaultExpandAll
      treeData={buildRolePermissionTreeData(completeCatalog, formatMessage, {
        includeBuiltInRows: true,
      })}
    />,
  );

  expect(screen.getByText('Roles')).toBeTruthy();
  expect(screen.getByText('View roles')).toBeTruthy();
  expect(screen.getByText('Assign roles')).toBeTruthy();
  expect(screen.getByText('Create roles')).toBeTruthy();
  expect(screen.getByText('Edit roles')).toBeTruthy();
  expect(screen.getByText('Delete roles')).toBeTruthy();
  expect(screen.queryByText(/unknown/i)).toBeNull();
  expect(screen.getByText('Personal address book')).toBeTruthy();
  expect(screen.getByText('Basic feature')).toBeTruthy();
  expect(screen.getByText('Protected accounts')).toBeTruthy();

  for (const code of ['roles.create', 'roles.edit', 'roles.delete']) {
    const row = screen.getByRole('treeitem', {
      name: new RegExp(labels[code]),
    });
    expect(row.classList.contains('ant-tree-treenode-disabled')).toBe(true);
    expect(row.querySelector('.ant-tree-checkbox-disabled')).toBeTruthy();
  }
  for (const code of ['roles.view', 'roles.assign']) {
    const row = screen.getByRole('treeitem', {
      name: new RegExp(labels[code]),
    });
    expect(row.classList.contains('ant-tree-treenode-disabled')).toBe(false);
    expect(row.querySelector('.ant-tree-checkbox-disabled')).toBeNull();
  }

  const personalAddressBook = screen
    .getByText('Personal address book')
    .closest('.ant-tree-treenode');
  expect(
    personalAddressBook?.querySelector('.ant-tree-checkbox-disabled'),
  ).toBeTruthy();
});

test('built-in presentation rows never enter the role submission payload', () => {
  expect(
    getAssignablePermissionPayload(
      [
        'builtin.personal-address-book',
        'builtin.protected-account',
        'roles.view',
        'roles.create',
      ],
      completeCatalog,
    ),
  ).toEqual(['roles.view']);
});

test('renders the ordinary built-in role with only its fixed basic capability', () => {
  render(
    <Tree
      checkable
      disabled
      defaultExpandAll
      checkedKeys={['builtin.personal-address-book']}
      treeData={buildRolePermissionTreeData([], formatMessage, {
        includeBuiltInRows: true,
      })}
    />,
  );

  expect(screen.getByText('Personal address book')).toBeTruthy();
  expect(screen.getByText('Basic feature')).toBeTruthy();
  expect(screen.queryByText('Protected accounts')).toBeNull();
  expect(screen.queryByText('View roles')).toBeNull();
  expect(screen.getAllByRole('treeitem')).toHaveLength(2);
});

test('renders system-owner-only capabilities as checked disabled tree rows', () => {
  const capabilities = [
    'settings.manage',
    'device_groups.manage',
    'identity_sources.manage',
  ] as const;
  render(
    <Tree
      checkable
      disabled
      defaultExpandAll
      checkedKeys={capabilities.map(getSystemCapabilityTreeKey)}
      treeData={buildRolePermissionTreeData(completeCatalog, formatMessage, {
        includeBuiltInRows: true,
        systemCapabilities: capabilities,
      })}
    />,
  );

  expect(screen.getByText('System capabilities')).toBeTruthy();
  for (const capability of capabilities) {
    const row = screen.getByText(capability).closest('.ant-tree-treenode');
    expect(row?.querySelector('.ant-tree-checkbox-checked')).toBeTruthy();
    expect(row?.querySelector('.ant-tree-checkbox-disabled')).toBeTruthy();
  }
});
