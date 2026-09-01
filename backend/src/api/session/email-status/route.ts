import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';

// POST /session/email-status — { email } → { needsPassword }. Tells the login
// screen whether this address still needs a first-time password sign-in, or can
// go straight to an emailed code. Public + fail-safe: any doubt → needsPassword
// true (the password path always works, so no one is locked out).
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const email = ((req.body as { email?: string })?.email ?? '').toString().trim().toLowerCase();
    if (!email || !/.+@.+\..+/.test(email)) { res.json({ needsPassword: true }); return; }
    const knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
    const row = await knex('login_prefs').where({ email }).first();
    res.json({ needsPassword: !(row && row.bootstrapped) });
  } catch {
    res.json({ needsPassword: true });
  }
}
