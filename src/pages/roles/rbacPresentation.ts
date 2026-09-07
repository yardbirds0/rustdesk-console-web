import { addRequiredPermissions } from './permissionDependencies';

export const PERSONAL_ADDRESS_BOOK_KEY = 'builtin.personal-address-book';
export const CUSTOM_ROLE_PERMISSION_PRESET_KEY = 'custom' as const;

export const ROLE_PERMISSION_PRESETS = [
  {
    key: 'readOnly',
    defaultMessage: 'Global read-only',
    permissions: [
      'users.view',
      'user_groups.view',
      'devices.view',
      'address_books.view',
      'strategies.view',
      'audit.view',
    ],
  },
  {
    key: 'deviceOperator',
    defaultMessage: 'Device operator',
    permissions: [
      'devices.view',
      'devices.edit',
      'devices.status',
      'devices.disconnect',
    ],
  },
  {
    key: 'userAdministrator',
    defaultMessage: 'User administrator',
    permissions: [
      'users.view',
      'users.create',
      'users.edit',
      'users.status',
      'user_groups.view',
      'user_groups.membership',
    ],
  },
  {
    key: 'sharedAddressBookAdministrator',
    defaultMessage: 'Shared address book administrator',
    permissions: [
      'address_books.view',
      'address_books.edit',
      'address_books.share',
    ],
  },
  {
    key: 'strategyMaintainer',
    defaultMessage: 'Strategy maintainer',
    permissions: ['strategies.view', 'strategies.create', 'strategies.edit'],
  },
  {
    key: 'deviceStrategyAssigner',
    defaultMessage: 'Device strategy assigner',
    permissions: ['devices.view', 'strategies.assign'],
  },
  {
    key: 'systemAdministrator',
    defaultMessage: 'System administrator',
    permissions: null,
    protectedAccount: true,
  },
] as const;

export type RolePermissionPresetKey =
  (typeof ROLE_PERMISSION_PRESETS)[number]['key'];
export type RolePermissionPresetSelection =
  | typeof CUSTOM_ROLE_PERMISSION_PRESET_KEY
  | RolePermissionPresetKey;

export function resolvePresetPermissions(
  presetKey: RolePermissionPresetKey,
  catalog: API.PermissionItem[],
): string[] {
  const availableCodes = catalog
    .filter((permission) => permission.assignable)
    .map((permission) => permission.code);
  const available = new Set(availableCodes);
  const preset = ROLE_PERMISSION_PRESETS.find((item) => item.key === presetKey);
  const selected =
    preset?.permissions === null
      ? availableCodes
      : (preset?.permissions || []).filter((code) => available.has(code));

  return addRequiredPermissions(selected, catalog);
}

export function getMatchingRolePermissionPreset(
  selectedCodes: string[],
  catalog: API.PermissionItem[],
  protectedAccount = false,
): RolePermissionPresetSelection {
  if (catalog.length === 0) return CUSTOM_ROLE_PERMISSION_PRESET_KEY;

  const available = new Set(
    catalog
      .filter((permission) => permission.assignable)
      .map((permission) => permission.code),
  );
  const selected = new Set(selectedCodes.filter((code) => available.has(code)));
  const preset = ROLE_PERMISSION_PRESETS.find(({ key }) => {
    const presetProtected = key === 'systemAdministrator';
    if (presetProtected !== protectedAccount) return false;
    const presetPermissions = resolvePresetPermissions(key, catalog);
    return (
      presetPermissions.length === selected.size &&
      presetPermissions.every((code) => selected.has(code))
    );
  });

  return preset?.key ?? CUSTOM_ROLE_PERMISSION_PRESET_KEY;
}

export function getMatchingRolePermissionPresetForRole(
  selectedCodes: string[],
  catalog: API.PermissionItem[],
  protectedAccount: boolean,
): RolePermissionPresetSelection {
  return getMatchingRolePermissionPreset(
    selectedCodes,
    catalog,
    protectedAccount,
  );
}

export function applyRolePermissionPreset(
  presetKey: RolePermissionPresetSelection,
  selectedCodes: string[],
  catalog: API.PermissionItem[],
): string[] {
  return presetKey === CUSTOM_ROLE_PERMISSION_PRESET_KEY
    ? selectedCodes
    : resolvePresetPermissions(presetKey, catalog);
}

export function presetEnablesProtection(
  presetKey: RolePermissionPresetSelection,
): boolean {
  return presetKey === 'systemAdministrator';
}
