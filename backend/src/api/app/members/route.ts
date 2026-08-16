import type { MedusaResponse } from '@medusajs/framework/http';
import { randomBytes } from 'crypto';
import { assertCapability, ScopeError } from '../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';
import { getServiceClient } from '../../../security/supabase-scope-resolver';

// Roles a tenant admin may assign in-app (platform_owner is intentionally excluded).
const ASSIGNABLE_ROLES = ['worker', 'storekeeper', 'supervisor', 'manager', 'executive', 'merchant', 'tenant_admin'];

type Body = { email?: string; name?: string; role?: string; siteId?: string };

// GET /app/members — list the tenant's members with their role + status.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'tenant.members.read');
    const db = getServiceClient();

    const { data: rows, error } = await db
      .from('memberships')
      .select('id, user_id, status, profiles(display_name), membership_roles(role:roles(key,name))')
      .eq('tenant_id', scope.tenantId)
      .neq('status', 'closed');
    if (error) throw new Error(error.message);

    // Emails live in auth.users — fetch per member (small N).
    const members = await Promise.all((rows ?? []).map(async (m: any) => {
      let email: string | null = null;
      try { const { data } = await db.auth.admin.getUserById(m.user_id); email = data?.user?.email ?? null; } catch { /* ignore */ }
      const roles = (m.membership_roles ?? []).map((r: any) => r.role?.key).filter(Boolean);
      return {
        membershipId: m.id,
        userId: m.user_id,
        name: m.profiles?.display_name ?? email ?? 'Member',
        email,
        role: roles[0] ?? null,
        roles,
        status: m.status,
      };
    }));

    res.json({ members, assignableRoles: ASSIGNABLE_ROLES });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'members_read_failed', message: (error as Error).message });
  }
}

// POST /app/members — invite/create a user and assign a role in this tenant.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'tenant.members.manage', true);

    const body = (req.body ?? {}) as Body;
    const email = (body.email ?? '').toString().trim().toLowerCase();
    const name = (body.name ?? '').toString().trim();
    const role = (body.role ?? '').toString().trim();
    if (!email || !/.+@.+\..+/.test(email)) throw new ScopeError(400, 'invalid_email', 'A valid email is required.');
    if (!ASSIGNABLE_ROLES.includes(role)) throw new ScopeError(400, 'invalid_role', `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`);

    const db = getServiceClient();

    // Role id.
    const { data: roleRow, error: roleErr } = await db.from('roles').select('id').eq('key', role).single();
    if (roleErr || !roleRow) throw new Error('Role not found in the database.');

    // Site to scope the membership to (the caller's site, else the tenant's first active site).
    let siteId = body.siteId || scope.siteId || null;
    if (!siteId) {
      const { data: site } = await db.from('sites').select('id').eq('tenant_id', scope.tenantId).eq('status', 'active').limit(1).single();
      siteId = site?.id ?? null;
    }

    // Create (or find) the auth user. Generate a temp password so it works
    // without SMTP; the admin shares it and the user changes it + enrols 2FA.
    const tempPassword = randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '') + 'A1!';
    let userId: string | null = null;
    let tempPasswordOut: string | null = tempPassword;
    const created = await db.auth.admin.createUser({ email, password: tempPassword, email_confirm: true, user_metadata: { display_name: name } });
    if (created.error) {
      // Likely already exists — look them up so we still attach the membership.
      const { data: list } = await db.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
      if (!existing) throw new Error(created.error.message);
      userId = existing.id;
      tempPasswordOut = null; // existing user keeps their password
    } else {
      userId = created.data.user?.id ?? null;
    }
    if (!userId) throw new Error('Could not resolve the user id.');

    // Profile.
    await db.from('profiles').upsert({ id: userId, display_name: name || email, status: 'active' }, { onConflict: 'id' });

    // Membership.
    let membershipId: string;
    const { data: existingM } = await db.from('memberships').select('id').eq('tenant_id', scope.tenantId).eq('user_id', userId).maybeSingle();
    if (existingM) {
      membershipId = existingM.id;
      await db.from('memberships').update({ status: 'active' }).eq('id', membershipId);
    } else {
      const { data: m, error: mErr } = await db.from('memberships').insert({ tenant_id: scope.tenantId, user_id: userId, status: 'active' }).select('id').single();
      if (mErr || !m) throw new Error(mErr?.message || 'Could not create the membership.');
      membershipId = m.id;
    }

    // Replace roles with the chosen one, and scope to the site.
    await db.from('membership_roles').delete().eq('membership_id', membershipId);
    await db.from('membership_roles').insert({ membership_id: membershipId, role_id: roleRow.id });
    if (siteId) await db.from('membership_sites').upsert({ membership_id: membershipId, site_id: siteId, tenant_id: scope.tenantId }, { onConflict: 'membership_id,site_id' });

    res.status(201).json({ userId, email, role, name, tempPassword: tempPasswordOut });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'member_invite_failed', message: (error as Error).message });
  }
}
