import { expect, test } from '@jest/globals';
import {
  applyRolePermissionPreset,
  BUILT_IN_ORDINARY_ROLE_GUID,
  BUILT_IN_SUPER_ADMIN_ROLE_GUID,
  CUSTOM_ROLE_PERMISSION_PRESET_KEY,
  getBuiltInRoleRows,
  getMatchingRolePermissionPreset,
  getMatchingRolePermissionPresetForRole,
  getRoleListPageWindow,
  ROLE_PERMISSION_PRESETS,
  resolvePresetPermissions,
} from './rbacPresentation';

const catalog = (
  codes: string[],
  requirements: Record<string, string[]> = {},
): API.PermissionItem[] =>
  codes.map((code) => ({
    code,
    resource: code.split('.')[0],
    action: code.split('.')[1],
    name: code,
    description: code,
    assignable: true,
    system_only: false,
    scope: 'global',
    requires: requirements[code] || [],
  }));

const allPermissionCodes = [
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
];

test('defines the seven approved role permission presets in display order', () => {
  expect(ROLE_PERMISSION_PRESETS.map((preset) => preset.key)).toEqual([
    'readOnly',
    'deviceOperator',
    'userAdministrator',
    'sharedAddressBookAdministrator',
    'strategyMaintainer',
    'deviceStrategyAssigner',
    'systemAdministrator',
  ]);
});

test('preset permissions use only catalog entries and preserve dependencies', () => {
  const permissions = resolvePresetPermissions(
    'deviceOperator',
    catalog(
      ['devices.view', 'devices.edit', 'devices.status', 'unknown.permission'],
      {
        'devices.edit': ['devices.view'],
        'devices.status': ['devices.view'],
      },
    ),
  );

  expect(new Set(permissions)).toEqual(
    new Set(['devices.view', 'devices.edit', 'devices.status']),
  );
});

test('uses the approved least-privilege mapping for each named preset', () => {
  const permissionCatalog = catalog(allPermissionCodes);
  const expected: Record<string, string[]> = {
    readOnly: [
      'users.view',
      'user_groups.view',
      'devices.view',
      'address_books.view',
      'strategies.view',
      'audit.view',
    ],
    deviceOperator: [
      'devices.view',
      'devices.edit',
      'devices.status',
      'devices.disconnect',
    ],
    userAdministrator: [
      'users.view',
      'users.create',
      'users.edit',
      'users.status',
      'user_groups.view',
      'user_groups.membership',
    ],
    sharedAddressBookAdministrator: [
      'address_books.view',
      'address_books.edit',
      'address_books.share',
    ],
    strategyMaintainer: [
      'strategies.view',
      'strategies.create',
      'strategies.edit',
    ],
    deviceStrategyAssigner: ['devices.view', 'strategies.assign'],
  };

  for (const [key, permissions] of Object.entries(expected)) {
    expect(
      new Set(
        resolvePresetPermissions(
          key as Exclude<
            (typeof ROLE_PERMISSION_PRESETS)[number]['key'],
            'systemAdministrator'
          >,
          permissionCatalog,
        ),
      ),
    ).toEqual(new Set(permissions));
  }
});

test('system administrator preset selects every assignable permission and excludes system-only capabilities', () => {
  const systemOnlyCodes = ['roles.create', 'roles.edit', 'roles.delete'];
  const permissions = resolvePresetPermissions(
    'systemAdministrator',
    catalog([...allPermissionCodes, ...systemOnlyCodes]).map((item) =>
      systemOnlyCodes.includes(item.code)
        ? { ...item, assignable: false, system_only: true }
        : item,
    ),
  );

  expect(permissions).toEqual(allPermissionCodes);
});

test('system administrator preset is the only preset that enables protection', () => {
  const system = ROLE_PERMISSION_PRESETS.find(
    (preset) => preset.key === 'systemAdministrator',
  );
  expect(system?.protectedAccount).toBe(true);
});

test('protected system administrator permissions match the system administrator preset', () => {
  const permissionCatalog = catalog(allPermissionCodes);
  const permissions = resolvePresetPermissions(
    'systemAdministrator',
    permissionCatalog,
  );
  expect(
    getMatchingRolePermissionPresetForRole(
      permissions,
      permissionCatalog,
      true,
    ),
  ).toBe('systemAdministrator');
  expect(
    getMatchingRolePermissionPresetForRole(
      permissions,
      permissionCatalog,
      false,
    ),
  ).toBe(CUSTOM_ROLE_PERMISSION_PRESET_KEY);
});

test('derives the selected preset by exact permission-set equality', () => {
  const permissionCatalog = catalog(allPermissionCodes);
  const readOnly = resolvePresetPermissions('readOnly', permissionCatalog);

  expect(getMatchingRolePermissionPreset([], permissionCatalog)).toBe(
    CUSTOM_ROLE_PERMISSION_PRESET_KEY,
  );
  expect(getMatchingRolePermissionPreset([], [])).toBe(
    CUSTOM_ROLE_PERMISSION_PRESET_KEY,
  );
  expect(
    getMatchingRolePermissionPreset([...readOnly].reverse(), permissionCatalog),
  ).toBe('readOnly');
  expect(
    getMatchingRolePermissionPreset(
      [...readOnly, 'devices.edit'],
      permissionCatalog,
    ),
  ).toBe(CUSTOM_ROLE_PERMISSION_PRESET_KEY);
  expect(
    getMatchingRolePermissionPreset(readOnly.slice(1), permissionCatalog),
  ).toBe(CUSTOM_ROLE_PERMISSION_PRESET_KEY);
  expect(getMatchingRolePermissionPreset(readOnly, permissionCatalog)).toBe(
    'readOnly',
  );
});

test('applies real presets exactly and leaves custom selections unchanged', () => {
  const permissionCatalog = catalog(allPermissionCodes);
  const current = ['devices.view', 'devices.edit'];

  expect(
    applyRolePermissionPreset(
      CUSTOM_ROLE_PERMISSION_PRESET_KEY,
      current,
      permissionCatalog,
    ),
  ).toBe(current);
  expect(
    new Set(
      applyRolePermissionPreset(
        'sharedAddressBookAdministrator',
        current,
        permissionCatalog,
      ),
    ),
  ).toEqual(
    new Set([
      'address_books.view',
      'address_books.edit',
      'address_books.share',
    ]),
  );
});

test('creates filtered virtual identities without mutation fields', () => {
  const rows = getBuiltInRoleRows(catalog(['devices.view']), {
    ordinary: { name: 'Ordinary user', note: 'Personal address book' },
    superAdmin: { name: 'Super administrator', note: 'Full authority' },
  });

  expect(rows.map((row) => row.guid)).toEqual([
    BUILT_IN_ORDINARY_ROLE_GUID,
    BUILT_IN_SUPER_ADMIN_ROLE_GUID,
  ]);
  expect(rows[0].builtInIdentity).toBe('ordinary');
  expect(rows[1].builtInIdentity).toBe('superAdmin');
  expect(rows[0].permissions).toEqual([]);
  expect(rows[1].permissions).toEqual([]);
  expect(rows[0].permission_count).toBe(1);
  expect(rows[1].permission_count).toBe(5);
  expect(
    getBuiltInRoleRows(
      catalog(['devices.view']),
      {
        ordinary: { name: 'Ordinary user', note: 'Personal address book' },
        superAdmin: { name: 'Super administrator', note: 'Full authority' },
      },
      { name: 'super' },
    ).map((row) => row.guid),
  ).toEqual([BUILT_IN_SUPER_ADMIN_ROLE_GUID]);
  expect(
    getBuiltInRoleRows(
      catalog(['devices.view']),
      {
        ordinary: { name: 'Ordinary user', note: 'Personal address book' },
        superAdmin: { name: 'Super administrator', note: 'Full authority' },
      },
      { note: 'personal' },
    ).map((row) => row.guid),
  ).toEqual([BUILT_IN_ORDINARY_ROLE_GUID]);
});

test('maps combined-list pages to the minimum custom-role window', () => {
  expect(getRoleListPageWindow(1, 20, 2)).toEqual({
    builtInOffset: 0,
    builtInLimit: 2,
    customOffset: 0,
    customLimit: 18,
  });
  expect(getRoleListPageWindow(2, 20, 2)).toEqual({
    builtInOffset: 2,
    builtInLimit: 0,
    customOffset: 18,
    customLimit: 20,
  });
});
