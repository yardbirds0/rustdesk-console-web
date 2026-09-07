import { expect, test } from '@jest/globals';
import type { RoleAssignmentDraft } from './userRoleAssignment';
import {
  changeAssignmentScope,
  deriveEffectivePermissionScopes,
  getRoleEligibility,
  groupEffectivePermissionScopes,
  isCurrentUserTarget,
  preserveLockedAssignments,
  roleSupportsDeviceGroupScope,
  toReplaceUserRolesParams,
  validateAssignments,
} from './userRoleAssignment';

const role = (guid: string, permissions: string[]): API.RoleItem => ({
  guid,
  name: guid,
  note: '',
  permissions,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
});

test('global and device-group modes are mutually exclusive', () => {
  const draft: RoleAssignmentDraft = {
    key: 'assignment',
    role_guid: 'devices-role',
    scope_type: 'device_group',
    device_group_guids: ['group-a'],
  };

  const global = changeAssignmentScope(draft, 'global');
  expect(global).toEqual({
    ...draft,
    scope_type: 'global',
    device_group_guids: [],
  });
  expect(toReplaceUserRolesParams([global])).toEqual({
    assignments: [
      {
        role_guid: 'devices-role',
        scope_type: 'global',
        device_group_guids: [],
      },
    ],
  });
});

test('locked existing assignments are preserved when editable choices change', () => {
  const locked: RoleAssignmentDraft = {
    key: 'locked',
    role_guid: 'protected-role',
    scope_type: 'global',
    device_group_guids: [],
    locked: true,
  };
  const editable: RoleAssignmentDraft = {
    key: 'editable',
    role_guid: 'editable-role',
    scope_type: 'global',
    device_group_guids: [],
  };
  expect(
    preserveLockedAssignments(
      [{ ...editable, role_guid: 'new-role' }],
      [locked, editable],
    ),
  ).toEqual([{ ...editable, role_guid: 'new-role' }, locked]);
});

test('missing eligibility fails closed with a stable reason', () => {
  const result = getRoleEligibility('role-a', new Map());
  expect(result.can_assign).toBe(false);
  expect(result.can_remove).toBe(false);
  expect(result.reason_code).toBe('assign_not_allowed');
});

test('self target detection uses only the server current-user GUID', () => {
  expect(isCurrentUserTarget('user-a', 'user-a')).toBe(true);
  expect(isCurrentUserTarget('user-a', 'user-b')).toBe(false);
  expect(isCurrentUserTarget(undefined, 'user-a')).toBe(false);
});

test('catalog metadata controls device-group scope eligibility', () => {
  const roles = new Map([
    ['future-role', role('future-role', ['devices.future_action'])],
    ['mixed-role', role('mixed-role', ['devices.future_action', 'users.view'])],
    ['global-role', role('global-role', ['users.view'])],
    ['empty-role', role('empty-role', [])],
  ]);
  const permissionScopes = new Map<string, API.PermissionItem['scope']>([
    ['devices.future_action', 'device_group'],
    ['users.view', 'global'],
  ]);
  const scoped: RoleAssignmentDraft = {
    key: 'assignment',
    role_guid: 'future-role',
    scope_type: 'device_group',
    device_group_guids: [],
  };

  expect(
    roleSupportsDeviceGroupScope(roles.get('future-role'), permissionScopes),
  ).toBe(true);
  expect(
    roleSupportsDeviceGroupScope(roles.get('mixed-role'), permissionScopes),
  ).toBe(false);
  expect(
    roleSupportsDeviceGroupScope(roles.get('global-role'), permissionScopes),
  ).toBe(false);
  expect(
    roleSupportsDeviceGroupScope(roles.get('empty-role'), permissionScopes),
  ).toBe(false);
  expect(validateAssignments([scoped], roles, permissionScopes)).toBe(
    'missing_device_group',
  );
  expect(
    validateAssignments(
      [{ ...scoped, role_guid: 'mixed-role', device_group_guids: ['group-a'] }],
      roles,
      permissionScopes,
    ),
  ).toBe('unsupported_device_group_scope');
  expect(
    validateAssignments(
      [{ ...scoped, device_group_guids: ['group-a'] }],
      roles,
      permissionScopes,
    ),
  ).toBeUndefined();
});

test('replacement payload deduplicates selected device groups', () => {
  expect(
    toReplaceUserRolesParams([
      {
        key: 'assignment',
        role_guid: 'devices-role',
        scope_type: 'device_group',
        device_group_guids: ['group-a', 'group-a', 'group-b'],
      },
    ]),
  ).toEqual({
    assignments: [
      {
        role_guid: 'devices-role',
        scope_type: 'device_group',
        device_group_guids: ['group-a', 'group-b'],
      },
    ],
  });
});

test('effective scopes union and deduplicate device groups across roles', () => {
  const roles = new Map([
    ['role-a', role('role-a', ['devices.view'])],
    ['role-b', role('role-b', ['devices.view', 'devices.edit'])],
  ]);

  expect(
    deriveEffectivePermissionScopes(
      [
        {
          key: 'assignment-a',
          role_guid: 'role-a',
          scope_type: 'device_group',
          device_group_guids: ['group-a', 'group-b'],
        },
        {
          key: 'assignment-b',
          role_guid: 'role-b',
          scope_type: 'device_group',
          device_group_guids: ['group-b', 'group-c'],
        },
      ],
      roles,
    ),
  ).toEqual({
    'devices.view': {
      scope_type: 'device_group',
      device_group_guids: ['group-a', 'group-b', 'group-c'],
    },
    'devices.edit': {
      scope_type: 'device_group',
      device_group_guids: ['group-b', 'group-c'],
    },
  });
});

test('a global draft overrides narrower grants for the same permission', () => {
  const roles = new Map([
    ['scoped-role', role('scoped-role', ['devices.view'])],
    ['global-role', role('global-role', ['devices.view'])],
  ]);

  expect(
    deriveEffectivePermissionScopes(
      [
        {
          key: 'scoped-assignment',
          role_guid: 'scoped-role',
          scope_type: 'device_group',
          device_group_guids: ['group-a'],
        },
        {
          key: 'global-assignment',
          role_guid: 'global-role',
          scope_type: 'global',
          device_group_guids: [],
        },
      ],
      roles,
    ),
  ).toEqual({
    'devices.view': {
      scope_type: 'global',
      device_group_guids: [],
    },
  });
});

test('an incomplete scoped draft remains visible with an empty group list', () => {
  const roles = new Map([
    ['devices-role', role('devices-role', ['devices.disconnect'])],
  ]);

  expect(
    deriveEffectivePermissionScopes(
      [
        {
          key: 'assignment',
          role_guid: 'devices-role',
          scope_type: 'device_group',
          device_group_guids: [],
        },
      ],
      roles,
    ),
  ).toEqual({
    'devices.disconnect': {
      scope_type: 'device_group',
      device_group_guids: [],
    },
  });
});

test('effective preview groups only actions with usable scopes by resource', () => {
  expect(
    groupEffectivePermissionScopes({
      'users.edit': {
        scope_type: 'global',
        device_group_guids: [],
      },
      'devices.view': {
        scope_type: 'device_group',
        device_group_guids: ['group-a', 'group-b'],
      },
      'devices.edit': {
        scope_type: 'device_group',
        device_group_guids: [],
      },
      'devices.disconnect': {
        scope_type: 'global',
        device_group_guids: [],
      },
    }),
  ).toEqual([
    {
      resource: 'devices',
      actions: [
        {
          permission: 'devices.disconnect',
          scope: {
            scope_type: 'global',
            device_group_guids: [],
          },
        },
        {
          permission: 'devices.view',
          scope: {
            scope_type: 'device_group',
            device_group_guids: ['group-a', 'group-b'],
          },
        },
      ],
    },
    {
      resource: 'users',
      actions: [
        {
          permission: 'users.edit',
          scope: {
            scope_type: 'global',
            device_group_guids: [],
          },
        },
      ],
    },
  ]);
});
