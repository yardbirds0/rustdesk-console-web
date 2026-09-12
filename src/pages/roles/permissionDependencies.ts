export const addRequiredPermissions = (
  selectedCodes: string[],
  catalog: API.PermissionItem[],
) => {
  const selected = new Set(selectedCodes);
  const requirements = new Map(
    catalog.map((permission) => [permission.code, permission.requires || []]),
  );
  const pending = [...selected];

  while (pending.length) {
    for (const required of requirements.get(pending.pop() || '') || []) {
      if (!selected.has(required)) {
        selected.add(required);
        pending.push(required);
      }
    }
  }
  return [...selected];
};

export const removeDependentPermissions = (
  selectedCodes: string[],
  removedCode: string,
  catalog: API.PermissionItem[],
) => {
  const selected = new Set(selectedCodes);
  const removed = new Set([removedCode]);
  selected.delete(removedCode);
  let changed = true;

  while (changed) {
    changed = false;
    for (const permission of catalog) {
      const code = permission.code;
      if (
        selected.has(code) &&
        (permission.requires || []).some((required) => removed.has(required))
      ) {
        selected.delete(code);
        removed.add(code);
        changed = true;
      }
    }
  }
  return [...selected];
};
