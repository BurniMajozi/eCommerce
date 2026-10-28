import { randomUUID } from 'crypto';
import { getServiceClient } from '../../../security/supabase-scope-resolver';

// Fan-out notifications: one row per recipient user, so read/unread is per person.
// Recipients are resolved from the tenant's active memberships (Supabase public
// schema); rows are inserted into the medusa `notifications` table (knex).

type Db = any;

export type NotifyInput = {
  tenantId: string;
  siteId?: string | null;
  recipientUserIds: string[];
  type: string;
  title: string;
  body?: string | null;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  linkRole?: string | null; // nav view id to jump to (e.g. 'REPORT_SAFETY')
  linkId?: string | null;    // ticket id for deep-link
  createdBy?: string | null;
  excludeUserId?: string | null; // don't notify the actor
  metadata?: Record<string, any>;
};

// Resolve active members of the tenant, optionally filtered to given role keys.
async function activeMembers(tenantId: string): Promise<Array<{ userId: string; roles: string[] }>> {
  try {
    const service = getServiceClient();
    const { data, error } = await service
      .from('memberships')
      .select('user_id, status, membership_roles(role:roles(key))')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    if (error) return [];
    return (data ?? [])
      .filter((m: any) => m.user_id)
      .map((m: any) => ({ userId: m.user_id as string, roles: (m.membership_roles ?? []).map((r: any) => r.role?.key).filter(Boolean) as string[] }));
  } catch { return []; }
}

export async function recipientsByRoles(tenantId: string, roleKeys: string[]): Promise<string[]> {
  const wanted = new Set(roleKeys);
  const members = await activeMembers(tenantId);
  return [...new Set(members.filter((m) => m.roles.some((k) => wanted.has(k))).map((m) => m.userId))];
}

export async function allActiveRecipients(tenantId: string): Promise<string[]> {
  const members = await activeMembers(tenantId);
  return [...new Set(members.map((m) => m.userId))];
}

// Manager / approver roles + admins — the people who act on escalations, safety
// reports and approvals.
export const MANAGER_ROLES = ['supervisor', 'manager', 'tenant_admin', 'executive', 'platform_owner'];

// Insert one notification row per recipient. Best-effort: never throws (a
// notification failure must not break the action that triggered it).
export async function emitNotifications(knex: Db, input: NotifyInput): Promise<number> {
  try {
    const ids = [...new Set((input.recipientUserIds ?? []).filter(Boolean))].filter((id) => id !== input.excludeUserId);
    if (!ids.length) return 0;
    const now = new Date().toISOString();
    const rows = ids.map((uid) => ({
      id: randomUUID(),
      tenant_id: input.tenantId,
      site_id: input.siteId ?? null,
      recipient_user_id: uid,
      type: input.type,
      title: input.title.slice(0, 300),
      body: input.body ? String(input.body).slice(0, 2000) : null,
      severity: input.severity ?? 'info',
      link_role: input.linkRole ?? null,
      link_id: input.linkId ?? null,
      created_by: input.createdBy ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
      created_at: now,
    }));
    await knex('notifications').insert(rows);
    return rows.length;
  } catch { return 0; }
}

// Convenience: resolve manager recipients then fan out.
export async function notifyManagers(knex: Db, input: Omit<NotifyInput, 'recipientUserIds'>): Promise<number> {
  const ids = await recipientsByRoles(input.tenantId, MANAGER_ROLES);
  return emitNotifications(knex, { ...input, recipientUserIds: ids });
}

// Convenience: fan out to every active member (a broadcast).
export async function notifyAllStaff(knex: Db, input: Omit<NotifyInput, 'recipientUserIds'>): Promise<number> {
  const ids = await allActiveRecipients(input.tenantId);
  return emitNotifications(knex, { ...input, recipientUserIds: ids });
}

export const toApiNotification = (n: any) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  severity: n.severity,
  linkRole: n.link_role,
  linkId: n.link_id,
  read: !!n.read_at,
  readAt: n.read_at,
  createdBy: n.created_by,
  metadata: typeof n.metadata === 'string' ? safeJson(n.metadata) : (n.metadata ?? {}),
  createdAt: n.created_at,
});

function safeJson(s: string): any { try { return JSON.parse(s); } catch { return {}; } }
