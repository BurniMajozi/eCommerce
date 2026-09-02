-- Give the merchant role the reporting + counter capabilities so a merchant can
-- report PPE stock activity back to the mine:
--   reports.read      → the Dashboard (no MFA)
--   reports.run       → run / export tenant reports (MFA)
--   audit.read        → read the tenant audit trail (MFA)
--   ppe.stock.issue   → issue stock at the Store Counter (MFA)
-- Nav is capability-gated, so Store Counter + Dashboard appear for merchants once
-- these grants land. The MFA-flagged ones prompt the authenticator step-up.
insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r
join public.capabilities c on c.key in ('reports.read', 'reports.run', 'audit.read', 'ppe.stock.issue')
where r.key = 'merchant'
on conflict do nothing;
