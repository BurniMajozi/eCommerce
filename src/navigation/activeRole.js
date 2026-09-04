export function resolveActiveRole(activeRole, visibleRoleIds = []) {
  if (visibleRoleIds.includes(activeRole)) return activeRole;
  return visibleRoleIds[0] ?? null;
}
