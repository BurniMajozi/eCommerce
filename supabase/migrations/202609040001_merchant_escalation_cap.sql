-- Merchant approvals: a merchant can VIEW stuck approvals and ESCALATE them
-- (flag + optionally email the approver) but can never approve or sign — that
-- stays with ppe.approve.* / platform.manage. New non-MFA read+escalate cap.
insert into public.capabilities (key, description, requires_mfa) values
  ('ppe.approve.escalate', 'View and escalate stuck approvals (no approve or sign)', false)
on conflict (key) do update set
  description = excluded.description,
  requires_mfa = excluded.requires_mfa;

-- Grant it to the merchant role so the escalation Approvals view appears.
insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r
join public.capabilities c on c.key = 'ppe.approve.escalate'
where r.key = 'merchant'
on conflict do nothing;
