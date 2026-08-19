// Department / role / individual entitlement scoping.
//
// A rule grants a PPE *category* to a scope (all | department | role | individual)
// with a quantity per cycle. The resolver returns which categories a given
// employee may request, so e.g. an Underground Driller (Shaft dept) can be
// blocked from Electrical/Arc-Flash PPE while an Electrician is allowed it.

export const PPE_CATEGORIES = [
  'Footwear', 'Head Protection', 'Hand Protection', 'Eye Protection', 'Eye & Face',
  'Respiratory Protection', 'Hearing Protection', 'Workwear', 'Speciality Workwear',
  'Protective Overalls', 'Arc Flash Protection', 'Welding Protection',
  'Thermal Gear', 'Specialized Safety',
];

export const DEPARTMENTS = [
  'Shaft 3 Extraction', 'Underground Operations', 'Shaft 1',
  'High-Voltage Substation', 'Engineering & Maintenance',
  'Processing Plant', 'Surface Operations',
];

// Per-category default allowance used when generating starter rules.
const CATEGORY_DEFAULTS = {
  'Footwear': { qty: 1, cycle: '6 months' },
  'Head Protection': { qty: 1, cycle: '24 months' },
  'Hand Protection': { qty: 4, cycle: 'monthly' },
  'Eye Protection': { qty: 2, cycle: '6 months' },
  'Eye & Face': { qty: 2, cycle: '6 months' },
  'Respiratory Protection': { qty: 0, cycle: 'unlimited' },
  'Hearing Protection': { qty: 1, cycle: '12 months' },
  'Workwear': { qty: 2, cycle: '12 months' },
  'Speciality Workwear': { qty: 1, cycle: '12 months' },
  'Protective Overalls': { qty: 2, cycle: '6 months' },
  'Arc Flash Protection': { qty: 1, cycle: '12 months' },
  'Welding Protection': { qty: 1, cycle: '12 months' },
  'Thermal Gear': { qty: 1, cycle: '24 months' },
  'Specialized Safety': { qty: 1, cycle: '12 months' },
};
const dflt = (cat) => CATEGORY_DEFAULTS[cat] || { qty: 1, cycle: '12 months' };

// Which categories each department is entitled to (the electrical/underground
// split the mine asked for). Unlisted departments fall back to BASICS.
const BASICS = ['Footwear', 'Head Protection', 'Hand Protection', 'Eye Protection'];
export const DEPT_CATEGORY_DEFAULTS = {
  'Shaft 3 Extraction': ['Footwear', 'Head Protection', 'Hand Protection', 'Respiratory Protection', 'Hearing Protection', 'Workwear', 'Eye Protection', 'Eye & Face'],
  'Underground Operations': ['Footwear', 'Head Protection', 'Hand Protection', 'Respiratory Protection', 'Hearing Protection', 'Workwear', 'Eye Protection', 'Protective Overalls'],
  'Shaft 1': ['Footwear', 'Head Protection', 'Hand Protection', 'Respiratory Protection', 'Hearing Protection', 'Workwear', 'Eye Protection'],
  'High-Voltage Substation': ['Arc Flash Protection', 'Footwear', 'Head Protection', 'Hand Protection', 'Eye Protection', 'Eye & Face', 'Thermal Gear', 'Specialized Safety'],
  'Engineering & Maintenance': ['Arc Flash Protection', 'Welding Protection', 'Footwear', 'Head Protection', 'Hand Protection', 'Eye & Face', 'Specialized Safety'],
  'Processing Plant': ['Respiratory Protection', 'Protective Overalls', 'Eye Protection', 'Hand Protection', 'Footwear', 'Hearing Protection'],
  'Surface Operations': ['Footwear', 'Workwear', 'Eye Protection', 'Hand Protection', 'Head Protection'],
};

let _seq = 0;
const rid = () => `ent-${Date.now().toString(36)}-${_seq++}`;

// Starter rule set: one rule per (department, allowed category), plus a global
// dust-mask rule and an example individual override.
export function buildDefaultRules() {
  const rules = [];
  for (const [dept, cats] of Object.entries(DEPT_CATEGORY_DEFAULTS)) {
    for (const category of cats) {
      const d = dflt(category);
      rules.push({ id: rid(), scope: 'department', target: dept, category, qty: d.qty, cycle: d.cycle, threshold: category === 'Arc Flash Protection' ? 'always 2nd approval' : 'auto-approve' });
    }
  }
  // Everyone can draw a dust mask.
  rules.push({ id: rid(), scope: 'all', target: '*', category: 'Respiratory Protection', qty: 0, cycle: 'unlimited', threshold: 'auto-approve' });
  // Example individual grant.
  rules.push({ id: rid(), scope: 'individual', target: 'EM-8492', category: 'Thermal Gear', qty: 1, cycle: '24 months', threshold: 'auto-approve' });
  return rules;
}

export function newRuleId() { return rid(); }

const matchesEmployee = (rule, emp) => {
  if (!rule || !emp) return false;
  const id = emp.id || emp.employeeId;
  switch (rule.scope) {
    case 'all': return true;
    case 'department': return rule.target === emp.department;
    case 'role': return rule.target === emp.role;
    case 'individual': return rule.target === id;
    default: return false;
  }
};

// Resolve what an employee may request. Returns:
//   categories: Set of allowed category strings
//   byCategory: Map(category -> the governing rule, most-specific wins)
//   rules: the matched rules
export function resolveEmployeeEntitlement(employee, rules) {
  const matched = (rules || []).filter((r) => matchesEmployee(r, employee));
  // Specificity: individual > role > department > all (later overrides qty/cycle).
  const rank = { all: 0, department: 1, role: 2, individual: 3 };
  const byCategory = new Map();
  for (const r of matched) {
    const cur = byCategory.get(r.category);
    if (!cur || (rank[r.scope] ?? 0) >= (rank[cur.scope] ?? 0)) byCategory.set(r.category, r);
  }
  const categories = new Set(byCategory.keys());
  // Never fully lock a valid worker out of the basics.
  if (categories.size === 0) BASICS.forEach((c) => categories.add(c));
  return { categories, byCategory, rules: matched };
}

export const isCategoryAllowed = (employee, rules, category) =>
  resolveEmployeeEntitlement(employee, rules).categories.has(category);
