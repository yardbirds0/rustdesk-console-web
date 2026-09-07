export type AssignmentScopeType = 'global' | 'device_group';

export type RoleAssignmentDraft = {
  key: string;
  role_guid: string;
  scope_type: AssignmentScopeType;
  device_group_guids: string[];
};

export type AssignmentValidationError =
  | 'missing_role'
  | 'duplicate_role'
  | 'unsupported_device_group_scope'
  | 'missing_device_group';

export const formatUserRoleNames = (
  user: Pick<API.UserItem, 'is_admin' | 'role_names'>,
  superAdminLabel: string,
): string =>
  user.is_admin
    ? superAdminLabel
    : user.role_names?.length
      ? user.role_names.join(', ')
      : '-';

export function roleSupportsDeviceGroupScope(
  role: API.RoleItem | undefined,
  permissionScopeByCode: ReadonlyMap<string, API.PermissionItem['scope']>,
): boolean {
  const permissions = role?.permissions || [];
  return (
    permissions.length > 0 &&
    permissions.every(
      (permission) => permissionScopeByCode.get(permission) === 'device_group',
    )
  );
}

export function changeAssignmentScope(
  draft: RoleAssignmentDraft,
  scopeType: AssignmentScopeType,
): RoleAssignmentDraft {
  return {
    ...draft,
    scope_type: scopeType,
    // Scope modes are alternatives. Never preserve group selections behind
    // the global tab or silently restore them when advanced mode is reopened.
    device_group_guids: [],
  };
}

export function validateAssignments(
  drafts: RoleAssignmentDraft[],
  roleByGuid: Map<string, API.RoleItem>,
  permissionScopeByCode: ReadonlyMap<string, API.PermissionItem['scope']>,
): AssignmentValidationError | undefined {
  const seen = new Set<string>();
  for (const draft of drafts) {
    if (!draft.role_guid) return 'missing_role';
    if (seen.has(draft.role_guid)) return 'duplicate_role';
    seen.add(draft.role_guid);
    if (draft.scope_type !== 'device_group') continue;
    if (
      !roleSupportsDeviceGroupScope(
        roleByGuid.get(draft.role_guid),
        permissionScopeByCode,
      )
    ) {
      return 'unsupported_device_group_scope';
    }
    if (draft.device_group_guids.length === 0) {
      return 'missing_device_group';
    }
  }
  return undefined;
}

export function deriveEffectivePermissionScopes(
  drafts: RoleAssignmentDraft[],
  roleByGuid: ReadonlyMap<string, API.RoleItem>,
): Record<string, API.EffectivePermissionScope> {
  const effectiveScopes: Record<string, API.EffectivePermissionScope> = {};

  for (const draft of drafts) {
    const permissions = roleByGuid.get(draft.role_guid)?.permissions || [];
    for (const permission of permissions) {
      const currentScope = effectiveScopes[permission];
      if (currentScope?.scope_type === 'global') continue;

      if (draft.scope_type === 'global') {
        effectiveScopes[permission] = {
          scope_type: 'global',
          device_group_guids: [],
        };
        continue;
      }

      effectiveScopes[permission] = {
        scope_type: 'device_group',
        device_group_guids: [
          ...new Set([
            ...(currentScope?.device_group_guids || []),
            ...draft.device_group_guids,
          ]),
        ],
      };
    }
  }

  return effectiveScopes;
}

export type EffectivePermissionScopeGroup = {
  resource: string;
  actions: Array<{
    permission: string;
    scope: API.EffectivePermissionScope;
  }>;
};

export function groupEffectivePermissionScopes(
  effectiveScopes: Readonly<Record<string, API.EffectivePermissionScope>>,
): EffectivePermissionScopeGroup[] {
  const grouped = new Map<string, EffectivePermissionScopeGroup['actions']>();

  for (const [permission, scope] of Object.entries(effectiveScopes)) {
    if (
      scope.scope_type === 'device_group' &&
      scope.device_group_guids.length === 0
    ) {
      continue;
    }
    const resource = permission.split('.')[0] || 'other';
    const actions = grouped.get(resource) || [];
    actions.push({ permission, scope });
    grouped.set(resource, actions);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, actions]) => ({
      resource,
      actions: actions.sort((a, b) => a.permission.localeCompare(b.permission)),
    }));
}

export function toReplaceUserRolesParams(
  drafts: RoleAssignmentDraft[],
): API.ReplaceUserRolesParams {
  return {
    assignments: drafts.map((draft) => ({
      role_guid: draft.role_guid,
      scope_type: draft.scope_type,
      device_group_guids:
        draft.scope_type === 'device_group'
          ? [...new Set(draft.device_group_guids)]
          : [],
    })),
  };
}
