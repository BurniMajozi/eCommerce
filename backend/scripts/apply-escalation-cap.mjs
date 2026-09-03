// Applies supabase/migrations/202609040001_merchant_escalation_cap.sql to the
// live public schema using the service-role key from env (never printed).
// Run: railway run --service Medusa -- node backend/scripts/apply-escalation-cap.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const CAP = { key: 'ppe.approve.escalate', description: 'View and escalate stuck approvals (no approve or sign)', requires_mfa: false };

const main = async () => {
  // 1) Upsert the capability.
  const up = await db.from('capabilities').upsert(CAP, { onConflict: 'key' }).select('id, key').single();
  if (up.error) throw up.error;
  const capabilityId = up.data.id;

  // 2) Resolve the merchant role id.
  const role = await db.from('roles').select('id, key').eq('key', 'merchant').single();
  if (role.error) throw role.error;

  // 3) Grant (idempotent — ignore duplicate).
  const grant = await db.from('role_capabilities').insert({ role_id: role.data.id, capability_id: capabilityId });
  if (grant.error && !/duplicate|conflict|unique/i.test(grant.error.message)) throw grant.error;

  // 4) Verify.
  const check = await db
    .from('role_capabilities')
    .select('capability:capabilities(key)')
    .eq('role_id', role.data.id);
  if (check.error) throw check.error;
  const caps = (check.data ?? []).map((r) => r.capability?.key).filter(Boolean).sort();
  console.log('merchant capabilities now:', JSON.stringify(caps));
  console.log('ppe.approve.escalate granted:', caps.includes('ppe.approve.escalate'));
};

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
