import { expect, test } from '@jest/globals';
import {
  applyRolePermissionPreset,
  CUSTOM_ROLE_PERMISSION_PRESET_KEY,
  getMatchingRolePermissionPreset,
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
];

test('defines the seven approved role permission presets in display order', () => {
  expect(ROLE_PERMISSION_PRESETS.map((preset) => preset.key)).toEqual([
    'readOnly',
    'deviceOperator',
    'userAdministrator',
    'sharedAddressBookAdministrator',
    'strategyMaintainer',
    'deviceStrategyAssigner',
    'full',
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
            'full'
          >,
          permissionCatalog,
        ),
      ),
    ).toEqual(new Set(permissions));
  }
});

test('full preset selects every real permission currently returned by the API', () => {
  const permissions = resolvePresetPermissions(
    'full',
    catalog(allPermissionCodes),
  );

  expect(permissions).toEqual(allPermissionCodes);
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
