import { addRequiredPermissions } from './permissionDependencies';

export const PERSONAL_ADDRESS_BOOK_KEY = 'builtin.personal-address-book';
export const CUSTOM_ROLE_PERMISSION_PRESET_KEY = 'custom' as const;
export const BUILT_IN_ORDINARY_ROLE_GUID = 'builtin.ordinary-user';
export const BUILT_IN_SUPER_ADMIN_ROLE_GUID = 'builtin.super-admin';
export const SUPER_ADMIN_NON_CATALOG_CAPABILITIES = [
  'settings.manage',
  'device_groups.manage',
  'identity_sources.manage',
] as const;

export type BuiltInRoleIdentity = 'ordinary' | 'superAdmin';

export type RoleListRow = API.RoleItem & {
  builtInIdentity?: BuiltInRoleIdentity;
  permission_count?: number;
};

export const isBuiltInRoleRow = (
  role: RoleListRow,
): role is RoleListRow & { builtInIdentity: BuiltInRoleIdentity } =>
  role.builtInIdentity !== undefined;

export function createBuiltInRoleRows(
  catalog: API.PermissionItem[],
  labels: Record<BuiltInRoleIdentity, { name: string; note: string }>,
): RoleListRow[] {
  return [
    {
      guid: BUILT_IN_ORDINARY_ROLE_GUID,
      name: labels.ordinary.name,
      note: labels.ordinary.note,
      permissions: [],
      permission_count: 1,
      builtInIdentity: 'ordinary',
      created_at: '',
      updated_at: '',
    },
    {
      guid: BUILT_IN_SUPER_ADMIN_ROLE_GUID,
      name: labels.superAdmin.name,
      note: labels.superAdmin.note,
      permissions: [],
      permission_count:
        1 + catalog.length + SUPER_ADMIN_NON_CATALOG_CAPABILITIES.length,
      builtInIdentity: 'superAdmin',
      created_at: '',
      updated_at: '',
    },
  ];
}

export type RoleListFilters = {
  name?: string;
  note?: string;
};

export function getBuiltInRoleRows(
  catalog: API.PermissionItem[],
  labels: Record<BuiltInRoleIdentity, { name: string; note: string }>,
  filters: RoleListFilters = {},
): RoleListRow[] {
  const normalizedName = filters.name?.trim().toLocaleLowerCase();
  const normalizedNote = filters.note?.trim().toLocaleLowerCase();
  return createBuiltInRoleRows(catalog, labels).filter((role) => {
    return (
      (!normalizedName ||
        role.name.toLocaleLowerCase().includes(normalizedName)) &&
      (!normalizedNote ||
        (role.note || '').toLocaleLowerCase().includes(normalizedNote))
    );
  });
}

export function getRoleListPageWindow(
  current: number,
  pageSize: number,
  builtInCount: number,
): {
  builtInOffset: number;
  builtInLimit: number;
  customOffset: number;
  customLimit: number;
} {
  const pageOffset = (Math.max(1, current) - 1) * pageSize;
  const builtInOffset = Math.min(pageOffset, builtInCount);
  const builtInLimit = Math.min(
    pageSize,
    Math.max(0, builtInCount - pageOffset),
  );
  return {
    builtInOffset,
    builtInLimit,
    customOffset: Math.max(0, pageOffset - builtInCount),
    customLimit: pageSize - builtInLimit,
  };
}

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
