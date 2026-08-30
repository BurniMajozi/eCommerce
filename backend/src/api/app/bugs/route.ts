import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { randomUUID } from 'crypto';
import { assertCapability, ScopeError } from '../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';
import { sendEmailAsync } from '../../../lib/agentmail';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const SEVERITIES = ['low', 'normal', 'high', 'critical'];

const toApi = (r: any) => ({
  id: r.id, tenantId: r.tenant_id, reporterEmail: r.reporter_email, reporterName: r.reporter_name,
  severity: r.severity, title: r.title, description: r.description, route: r.route,
  status: r.status, resolution: r.resolution, createdAt: r.created_at, updatedAt: r.updated_at,
});

// POST /app/bugs — any authenticated member can report a bug. Captures the
// reporter, the route they were on, and the browser, then notifies support.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    const b = (req.body ?? {}) as Record<string, any>;
    const title = (b.title ?? '').toString().trim();
    if (!title) throw new ScopeError(400, 'title_required', 'A short title is required.');
    const severity = SEVERITIES.includes(b.severity) ? b.severity : 'normal';

    const row = {
      id: randomUUID(),
      tenant_id: scope.tenantId,
      reporter_user_id: scope.userId ?? null,
      reporter_email: (b.reporterEmail ?? '').toString().trim().slice(0, 200) || null,
      reporter_name: (b.reporterName ?? '').toString().trim().slice(0, 200) || null,
      severity,
      title: title.slice(0, 300),
      description: (b.description ?? '').toString().slice(0, 5000) || null,
      route: (b.route ?? '').toString().slice(0, 300) || null,
      user_agent: (b.userAgent ?? '').toString().slice(0, 400) || null,
      status: 'open',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await pg(req)('bug_reports').insert(row);

    // Notify the support inbox if configured (env-gated; never blocks).
    const support = (process.env.SUPPORT_EMAIL ?? '').trim();
    if (support) {
      const esc = (v: any) => String(v ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px">
        <h2 style="margin:0 0 8px">New bug report — <span style="text-transform:capitalize">${esc(severity)}</span></h2>
        <p style="margin:0 0 6px"><strong>${esc(row.title)}</strong></p>
        ${row.description ? `<p style="white-space:pre-wrap;margin:0 0 10px">${esc(row.description)}</p>` : ''}
        <table style="font-size:12.5px;color:#555">
          <tr><td>Tenant</td><td>${esc(row.tenant_id)}</td></tr>
          <tr><td>Reporter</td><td>${esc(row.reporter_name || row.reporter_email || row.reporter_user_id || 'unknown')}</td></tr>
          <tr><td>Route</td><td>${esc(row.route || '—')}</td></tr>
          <tr><td>Browser</td><td>${esc(row.user_agent || '—')}</td></tr>
        </table></div>`;
      sendEmailAsync({ to: support, subject: `[Bug · ${severity}] ${row.title}`.slice(0, 180), html, labels: ['bug'] }, `bug ${row.id}`);
    }

    res.status(201).json({ id: row.id, ok: true });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'bug_report_failed', message: (error as Error).message });
  }
}

// GET /app/bugs — platform-owner triage across all tenants.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'platform.manage');
    const status = (req.query.status ?? '').toString();
    let q = pg(req)('bug_reports').orderBy('created_at', 'desc').limit(300);
    if (status) q = q.where({ status });
    const rows = await q;
    res.json({ bugs: (rows as any[]).map(toApi) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'bug_list_failed', message: (error as Error).message });
  }
}
