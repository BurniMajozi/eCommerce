-- Merchant approvals: a merchant can VIEW stuck approvals and ESCALATE them
-- (flag + optionally email the approver) but can never approve or sign — that
-- stays with ppe.approve.* / platform.manage. New non-MFA read+escalate cap.
insert into public.capabilities (key, description, requires_mfa) values
  ('ppe.approve.escalate', 'View and escalate stuck approvals (no approve or sign)', false)
on conflict (key) do update set
  description = excluded.description,
  requires_mfa = excluded.requires_mfa;

-- Grant it to EVERY role — escalation is now a universal action (any member can
-- flag a stuck approval to the responsible approver; approving still stays with
-- ppe.approve.*). The Escalations view is every role's default landing screen.
insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r
cross join public.capabilities c
where c.key = 'ppe.approve.escalate'
on conflict do nothing;
