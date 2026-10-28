import type { MedusaResponse } from '@medusajs/framework/http';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../security/supabase-scope-resolver';
import { ESCALATE_CAPS } from '../caps';

const daysSince = (d: string | null | undefined): number | null => {
  if (!d) return null;
  const t = Date.parse(d);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
};

// GET /app/approvals/escalations — the queue of approvals that have been
// escalated (flagged) to the responsible approver. Read from the tenant audit
// trail (action = 'approval.escalated'). This is the section that escalated
// approvals "move to" so a manager / Tier 2 sees what has been flagged, who
// raised it, when and any note. One row per escalated reference (latest wins),
// with how many times it has been escalated.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ESCALATE_CAPS);

    const db = getServiceClient();
    const { data, error } = await db
      .from('audit_events')
      .select('id, actor_user_id, target_type, target_id, metadata, created_at')
      .eq('tenant_id', scope.tenantId)
      .eq('action', 'approval.escalated')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    // Collapse to one entry per escalated item (latest escalation wins) and
    // count how many times each has been nudged.
    const byRef = new Map<string, any>();
    for (const ev of data ?? []) {
      const ref = String(ev.target_id ?? '').trim();
      if (!ref) continue;
      const meta = (ev.metadata ?? {}) as Record<string, any>;
      const kind = meta.kind || (ev.target_type === 'ppe_request' ? 'request' : 'po');
      if (byRef.has(ref)) {
        byRef.get(ref).times += 1;
        continue;
      }
      byRef.set(ref, {
        id: ev.id,
        reference: ref,
        kind,
        subject: meta.subject || ref,
        note: meta.note || '',
        escalatedBy: meta.escalatedBy || null,
        ageDaysAtEscalation: meta.ageDays ?? null,
        at: ev.created_at,
        sinceDays: daysSince(ev.created_at),
        times: 1,
      });
    }

    const escalations = [...byRef.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    res.json({ escalations });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'escalations_failed', message: (error as Error).message });
  }
}
