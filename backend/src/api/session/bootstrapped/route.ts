import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { verifySupabaseJwt } from '../../../security/supabase-scope-resolver';

// POST /session/bootstrapped — called right after a user completes their first
// (password + email code) sign-in. Marks their email so future logins only need
// the emailed code. Authenticated by the caller's own Supabase access token.
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const authz = req.headers.authorization;
    const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length).trim() : '';
    if (!token) { res.status(401).json({ error: 'no_token' }); return; }
    const claims = await verifySupabaseJwt(token);
    const email = ((claims as any)?.email ?? '').toString().trim().toLowerCase();
    if (!email) { res.status(400).json({ error: 'no_email' }); return; }
    const knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
    await knex('login_prefs')
      .insert({ email, bootstrapped: true, created_at: new Date(), updated_at: new Date() })
      .onConflict('email').merge({ bootstrapped: true, updated_at: new Date() });
    res.json({ ok: true });
  } catch (error) {
    res.status(401).json({ error: (error as Error).message });
  }
}
