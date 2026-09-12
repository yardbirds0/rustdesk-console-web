export function filterManageableSelection(
  keys: React.Key[],
  rows: API.UserItem[],
  isSuperAdmin: boolean,
): React.Key[] {
  if (isSuperAdmin) return keys;
  const known = new Set(rows.map((row) => row.guid));
  const blocked = new Set(
    rows
      .filter((row) => row.is_admin || row.is_protected === true)
      .map((row) => row.guid),
  );
  return keys.filter(
    (key) => known.has(String(key)) && !blocked.has(String(key)),
  );
}

export function isCurrentRequest(
  requestVersion: number,
  currentVersion: number,
): boolean {
  return requestVersion === currentVersion;
}
