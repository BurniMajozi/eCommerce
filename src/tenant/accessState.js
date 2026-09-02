export function resolveAccessState(tenantAccess) {
  if (!tenantAccess || tenantAccess.mode !== 'supabase') return 'ready';
  if (tenantAccess.loading) return 'loading';
  if (tenantAccess.error) return 'error';
  if (!tenantAccess.capabilities?.length) return 'unassigned';
  return 'ready';
}
