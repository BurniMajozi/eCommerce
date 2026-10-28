// Capabilities that let a user view and flag/escalate stuck approvals. This is
// effectively "any provisioned tenant member" — escalation only nudges the
// responsible approver; it never approves, signs or spends. Approving stays
// gated on ppe.approve.tier1 / ppe.approve.tier2 / platform.manage elsewhere.
export const ESCALATE_CAPS = [
  'ppe.request.create',
  'ppe.approve.tier1',
  'ppe.approve.tier2',
  'ppe.approve.escalate',
  'ppe.stock.issue',
  'commerce.read',
  'commerce.manage',
  'reports.read',
  'reports.run',
  'audit.read',
  'tenant.config.manage',
  'platform.manage',
];
