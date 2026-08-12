// CageLi PEP Stock Management - Mock Database initialized with exact client price list

export const CAGELI_PRODUCTS = [
  {
    sku: "DW-ARC40-WJ",
    name: "DROMEX ARC 40 CAL WINTER JACKETS",
    category: "Arc Flash Protection",
    costPrice: 1700.00,
    sellingPrice: 2900.00,
    stockOnHand: 14,
    stockInTransit: 10,
    dailyConsumption: 0.5,
    leadTimeDays: 14,
    abcClass: "A",
    lifespanMonths: 12,
    description: "Heavy duty 40 Cal thermal winter arc flash jacket SABS approved."
  },
  {
    sku: "DW-ARC15-J",
    name: "DROMEX ARC HRC2 - 15Cal JACKET",
    category: "Arc Flash Protection",
    costPrice: 770.00,
    sellingPrice: 1200.00,
    stockOnHand: 22,
    stockInTransit: 15,
    dailyConsumption: 1.1,
    leadTimeDays: 10,
    abcClass: "A",
    lifespanMonths: 12,
    description: "15Cal HRC2 flame retardant protective jacket."
  },
  {
    sku: "DW-ARC15-P",
    name: "DROMEX ARC HRC2 - 15Cal PANTS",
    category: "Arc Flash Protection",
    costPrice: 770.00,
    sellingPrice: 650.00,
    stockOnHand: 18,
    stockInTransit: 15,
    dailyConsumption: 1.0,
    leadTimeDays: 10,
    abcClass: "A",
    lifespanMonths: 12,
    description: "15Cal HRC2 arc flash protective trousers."
  },
  {
    sku: "DW-ARC9.9-SST",
    name: "DROMEX ARC T-SHIRT SHORT SLEEVE, 9.9 CAL",
    category: "Arc Flash Protection",
    costPrice: 506.00,
    sellingPrice: 150.00,
    stockOnHand: 45,
    stockInTransit: 30,
    dailyConsumption: 2.0,
    leadTimeDays: 7,
    abcClass: "B",
    lifespanMonths: 6,
    description: "9.9 Cal thermal protection short sleeve work shirt."
  },
  {
    sku: "DW-TSHIRTGY",
    name: "DROMEX GREY 100% Cotton Crew neck tee shirt",
    category: "Workwear",
    costPrice: 56.10,
    sellingPrice: 360.00,
    stockOnHand: 120,
    stockInTransit: 50,
    dailyConsumption: 5.0,
    leadTimeDays: 5,
    abcClass: "C",
    lifespanMonths: 3,
    description: "100% Heavyweight cotton grey crewneck undershirt."
  },
  {
    sku: "DW-6535XX-J",
    name: "DROMEX COLOURS 6535 Polycotton CONTI Jacket",
    category: "Workwear",
    costPrice: 161.70,
    sellingPrice: 330.00,
    stockOnHand: 68,
    stockInTransit: 40,
    dailyConsumption: 3.2,
    leadTimeDays: 7,
    abcClass: "B",
    lifespanMonths: 6,
    description: "SANS 434 fitted polycotton continental jacket."
  },
  {
    sku: "DW-6535XX-P",
    name: "DROMEX COLOURS 6535 Polycotton CONTI Pants",
    category: "Workwear",
    costPrice: 150.70,
    sellingPrice: 330.00,
    stockOnHand: 74,
    stockInTransit: 40,
    dailyConsumption: 3.2,
    leadTimeDays: 7,
    abcClass: "B",
    lifespanMonths: 6,
    description: "SANS 434 fitted polycotton continental trousers."
  },
  {
    sku: "PROMAX",
    name: "PROMAX White Disposable Overalls",
    category: "Protective Overalls",
    costPrice: 47.30,
    sellingPrice: 110.00,
    stockOnHand: 340,
    stockInTransit: 200,
    dailyConsumption: 18.0,
    leadTimeDays: 3,
    abcClass: "C",
    lifespanMonths: 0.1,
    description: "Type 5/6 hazardous dust & splash disposable coverall."
  },
  {
    sku: "DW-CONTI-RTOR",
    name: "DROMEX ORANGECONTI SUITS with Reflective",
    category: "Workwear",
    costPrice: 143.00,
    sellingPrice: 155.00,
    stockOnHand: 55,
    stockInTransit: 25,
    dailyConsumption: 2.5,
    leadTimeDays: 7,
    abcClass: "B",
    lifespanMonths: 6,
    description: "High-vis orange overall suit with 50mm silver reflective tape."
  },
  {
    sku: "CEM",
    name: "Classic Muff, SNR 30, Blue",
    category: "Hearing Protection",
    costPrice: 93.50,
    sellingPrice: 125.00,
    stockOnHand: 85,
    stockInTransit: 30,
    dailyConsumption: 1.5,
    leadTimeDays: 5,
    abcClass: "B",
    lifespanMonths: 12,
    description: "SNR 30dB noise reduction padded earmuffs."
  },
  {
    sku: "1020",
    name: "DROMEX FFP2 Respirator Mask (SABS REF: AZ2004/18)",
    category: "Respiratory Protection",
    costPrice: 6.74,
    sellingPrice: 15.00,
    stockOnHand: 850,
    stockInTransit: 500,
    dailyConsumption: 45.0,
    leadTimeDays: 2,
    abcClass: "C",
    lifespanMonths: 0.1,
    description: "SABS certified FFP2 particulate dust mask."
  },
  {
    sku: "NITRIFLEX-PC",
    name: "NITRIFLEX Black Sanitized PALM Nitrile Coated Gloves",
    category: "Hand Protection",
    costPrice: 19.01,
    sellingPrice: 28.00,
    stockOnHand: 420,
    stockInTransit: 200,
    dailyConsumption: 22.0,
    leadTimeDays: 3,
    abcClass: "C",
    lifespanMonths: 0.5,
    description: "Micro-foam nitrile palm coated general handling gloves."
  },
  {
    sku: "MIIZULFM4001W",
    name: "MIIZU 400 THERMAL, HI VIZ, WINTER Gloves",
    category: "Hand Protection",
    costPrice: 36.19,
    sellingPrice: 42.00,
    stockOnHand: 110,
    stockInTransit: 50,
    dailyConsumption: 4.0,
    leadTimeDays: 5,
    abcClass: "C",
    lifespanMonths: 1,
    description: "Thermal insulated high-visibility cold handling gloves."
  },
  {
    sku: "DH-HH-DB",
    name: "Dromex Hard Hat DARK BLUE (Lamination Blue)",
    category: "Head Protection",
    costPrice: 73.70,
    sellingPrice: 120.00,
    stockOnHand: 45,
    stockInTransit: 20,
    dailyConsumption: 0.8,
    leadTimeDays: 7,
    abcClass: "B",
    lifespanMonths: 24,
    description: "UV stabilized HDPE safety hard hat dark blue."
  },
  {
    sku: "DH-HH-W",
    name: "Dromex Hard Hat WHITE",
    category: "Head Protection",
    costPrice: 73.70,
    sellingPrice: 120.00,
    stockOnHand: 60,
    stockInTransit: 20,
    dailyConsumption: 1.0,
    leadTimeDays: 7,
    abcClass: "B",
    lifespanMonths: 24,
    description: "UV stabilized HDPE safety hard hat white."
  },
  {
    sku: "DV-326B-C-AF",
    name: "SPOGGLE, CLEAR, ANTI MIST",
    category: "Eye Protection",
    costPrice: 61.05,
    sellingPrice: 98.00,
    stockOnHand: 130,
    stockInTransit: 60,
    dailyConsumption: 3.5,
    leadTimeDays: 4,
    abcClass: "B",
    lifespanMonths: 6,
    description: "Hybrid safety goggle/spectacle with anti-fog clear lens."
  },
  {
    sku: "ACE ONE 60x90",
    name: "ACE Leather Welders Apron 60x90cm",
    category: "Specialized Safety",
    costPrice: 80.30,
    sellingPrice: 103.00,
    stockOnHand: 28,
    stockInTransit: 10,
    dailyConsumption: 0.4,
    leadTimeDays: 8,
    abcClass: "B",
    lifespanMonths: 12,
    description: "Heavy duty split cowhide leather welding apron."
  },
  {
    sku: "DF-CHELSEA-BLK",
    name: "DROMEX CHELSEA BLACK BOOT",
    category: "Footwear",
    costPrice: 696.30,
    sellingPrice: 1080.00,
    stockOnHand: 12,
    stockInTransit: 20,
    dailyConsumption: 0.9,
    leadTimeDays: 12,
    abcClass: "A",
    lifespanMonths: 6,
    description: "S3 rated steel toe leather Chelsea safety boot."
  },
  {
    sku: "DF-CHELSEA-BR",
    name: "DROMEX CHELSEA BROWN BOOT",
    category: "Footwear",
    costPrice: 696.30,
    sellingPrice: 1085.00,
    stockOnHand: 16,
    stockInTransit: 20,
    dailyConsumption: 0.8,
    leadTimeDays: 12,
    abcClass: "A",
    lifespanMonths: 6,
    description: "Full grain leather Chelsea safety boot in brown."
  },
  {
    sku: "DF-UBLK",
    name: "DROMEX ULTECO SAFETY BOOT BLACK",
    category: "Footwear",
    costPrice: 413.60,
    sellingPrice: 720.00,
    stockOnHand: 34,
    stockInTransit: 25,
    dailyConsumption: 1.5,
    leadTimeDays: 10,
    abcClass: "B",
    lifespanMonths: 6,
    description: "Heavy duty lace-up steel toe cap mining boot."
  },
  {
    sku: "DB-STG-J",
    name: "DROMEX STORM GLACIER FREEZER JACKET",
    category: "Thermal Gear",
    costPrice: 310.20,
    sellingPrice: 500.00,
    stockOnHand: 19,
    stockInTransit: 10,
    dailyConsumption: 0.3,
    leadTimeDays: 10,
    abcClass: "B",
    lifespanMonths: 12,
    description: "Cold store freezer parka with high thermal insulation rating."
  },
  {
    sku: "DF-SP-STCM",
    name: "DROMEX SPARTACUS GUMBOOT, STCM",
    category: "Footwear",
    costPrice: 183.70,
    sellingPrice: 390.00,
    stockOnHand: 48,
    stockInTransit: 30,
    dailyConsumption: 2.1,
    leadTimeDays: 7,
    abcClass: "B",
    lifespanMonths: 6,
    description: "Steel toe cap heavy duty PVC mining gumboot."
  },
  {
    sku: "SA10-LIME",
    name: "LIME Reflective Vest, ZIP, ID POUCH",
    category: "Workwear",
    costPrice: 22.55,
    sellingPrice: 70.00,
    stockOnHand: 210,
    stockInTransit: 100,
    dailyConsumption: 8.5,
    leadTimeDays: 3,
    abcClass: "C",
    lifespanMonths: 3,
    description: "High visibility lime vest with zip closure and ID pocket."
  },
  {
    sku: "DF-FLASH",
    name: "DROMEX FLASHTREAD ARC BOOT",
    category: "Footwear",
    costPrice: 1109.90,
    sellingPrice: 1560.00,
    stockOnHand: 8,
    stockInTransit: 15,
    dailyConsumption: 0.3,
    leadTimeDays: 14,
    abcClass: "A",
    lifespanMonths: 12,
    description: "Premium electrical arc-resistant specialized footwear."
  }
];

export const MOCK_EMPLOYEES = [
  {
    id: "EM-8492",
    name: "John Sibanda",
    role: "Underground Driller",
    department: "Shaft 3 Extraction",
    plant: "Kumba Iron Ore - Plant Alpha",
    pin: "4092",
    custody: [
      {
        sku: "DF-CHELSEA-BLK",
        name: "DROMEX CHELSEA BLACK BOOT",
        issueDate: "2026-03-15",
        lifespanMonths: 6,
        condition: "Fair (70% wear)",
        status: "ACTIVE_CUSTODY"
      },
      {
        sku: "DH-HH-DB",
        name: "Dromex Hard Hat DARK BLUE",
        issueDate: "2025-08-10",
        lifespanMonths: 24,
        condition: "Good",
        status: "ACTIVE_CUSTODY"
      },
      {
        sku: "SA10-LIME",
        name: "LIME Reflective Vest",
        issueDate: "2026-06-01",
        lifespanMonths: 3,
        condition: "Needs Replacement",
        status: "ACTIVE_CUSTODY"
      }
    ]
  },
  {
    id: "EM-1042",
    name: "Siyabonga Ndlovu",
    role: "Electrical Maintenance Tech",
    department: "High-Voltage Substation",
    plant: "Kumba Iron Ore - Plant Alpha",
    pin: "1042",
    custody: [
      {
        sku: "DW-ARC40-WJ",
        name: "DROMEX ARC 40 CAL WINTER JACKET",
        issueDate: "2025-11-01",
        lifespanMonths: 12,
        condition: "Good",
        status: "ACTIVE_CUSTODY"
      },
      {
        sku: "DF-FLASH",
        name: "DROMEX FLASHTREAD ARC BOOT",
        issueDate: "2026-01-15",
        lifespanMonths: 12,
        condition: "Good",
        status: "ACTIVE_CUSTODY"
      }
    ]
  }
];

export const MOCK_REQUESTS = [
  {
    id: "REQ-9014",
    employeeId: "EM-8492",
    employeeName: "John Sibanda",
    department: "Shaft 3 Extraction",
    plant: "Kumba Iron Ore - Plant Alpha",
    sku: "DF-CHELSEA-BLK",
    itemName: "DROMEX CHELSEA BLACK BOOT",
    category: "Footwear",
    costPrice: 696.30,
    sellingPrice: 1080.00,
    abcClass: "A",
    reason: "Damaged on Duty (Sole Torn)",
    isEarlyReplacement: true,
    photoProofUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80",
    requestDate: "2026-08-10 14:22",
    status: "PENDING_APPROVAL",
    approvalTierRequired: 2,
    tier1Status: "APPROVED_SUPERVISOR",
    tier2Status: "PENDING_MINE_MANAGER",
    otp: "8492"
  },
  {
    id: "REQ-9015",
    employeeId: "EM-1042",
    employeeName: "Siyabonga Ndlovu",
    department: "High-Voltage Substation",
    plant: "Kumba Iron Ore - Plant Alpha",
    sku: "NITRIFLEX-PC",
    itemName: "NITRIFLEX Black Sanitized PALM Gloves",
    category: "Hand Protection",
    costPrice: 19.01,
    sellingPrice: 28.00,
    abcClass: "C",
    reason: "Standard Monthly Allocation",
    isEarlyReplacement: false,
    photoProofUrl: null,
    requestDate: "2026-08-10 16:05",
    status: "APPROVED",
    approvalTierRequired: 1,
    tier1Status: "APPROVED_SUPERVISOR",
    tier2Status: "NOT_REQUIRED",
    otp: "1042"
  }
];

export const MOCK_QUOTATIONS = [
  {
    id: "QT-2026-089",
    clientName: "Anglo American Platinum - Rustenburg Site",
    vatNumber: "ZA4920194821",
    poNumber: "PO-77401-AP",
    date: "2026-08-10",
    validDays: 30,
    status: "DRAFT",
    marginPercent: 35,
    items: [
      { sku: "DW-ARC40-WJ", name: "DROMEX ARC 40 CAL WINTER JACKET", qty: 10, unitCost: 1700.00, unitPrice: 2900.00 },
      { sku: "DF-FLASH", name: "DROMEX FLASHTREAD ARC BOOT", qty: 15, unitCost: 1109.90, unitPrice: 1560.00 },
      { sku: "1020", name: "DROMEX FFP2 Respirator Mask", qty: 200, unitCost: 6.74, unitPrice: 15.00 }
    ]
  }
];

export const MOCK_PLANTS = [
  { id: "CAGELI-MERCHANT", name: "CageLi Global Merchant Portal", code: "MERCH-HQ", domain: "merchant.cageli-pep.com" },
  { id: "KUMBA-ALPHA", name: "Kumba Iron Ore - Plant Alpha", code: "KIO-PLA", domain: "kumba-alpha.cageli-pep.com" },
  { id: "TENKE-COPPER", name: "Tenke Fungurume - Shaft 4", code: "TFM-S4", domain: "tenke-s4.cageli-pep.com" }
];

// ─────────────────────────────────────────────────────────────────────────
// ADMIN & ACCESS (Wireframe Turn 2) — two admin levels on one codebase:
//   Level 1 · PLATFORM OWNER  — sees across tenants, sets branding/plans/flags
//   Level 2 · TENANT ADMIN    — sees only their plant: users, rules, reports
// ─────────────────────────────────────────────────────────────────────────

// Level-1 owner view — every tenant (plant / mine / company) on the platform
export const MOCK_TENANTS = [
  {
    id: "KUMBA-ALPHA",
    name: "Kumba Iron Ore — Plant Alpha",
    domain: "kumba-alpha.cageli-pep.com",
    users: 312,
    plan: "Site",
    mrr: 18400,
    state: "live",
    trial: false,
    modules: ["issue", "reporting", "b2b", "offline"],
    branding: { accent: "#2563EB", ink: "#0B1220", ground: "#F3F4F6", logo: "K" }
  },
  {
    id: "RAND-COLLIERY",
    name: "Rand Colliery",
    domain: "rand.cageli-pep.com",
    users: 88,
    plan: "Buyer",
    mrr: 6200,
    state: "live",
    trial: false,
    modules: ["issue", "reporting", "offline"],
    branding: { accent: "#0891B2", ink: "#0B1220", ground: "#F3F4F6", logo: "R" }
  },
  {
    id: "TENKE-COPPER",
    name: "Tenke Fungurume — Shaft 4",
    domain: "tenke-s4.cageli-pep.com",
    users: 140,
    plan: "Site",
    mrr: 11900,
    state: "live",
    trial: false,
    modules: ["issue", "reporting", "b2b", "supplier", "offline"],
    branding: { accent: "#7C3AED", ink: "#0B1220", ground: "#F3F4F6", logo: "T" }
  },
  {
    id: "GROUP-HQ",
    name: "Group HQ",
    domain: "—",
    users: 6,
    plan: "Trial",
    mrr: 0,
    state: "setup",
    trial: true,
    modules: ["reporting"],
    branding: { accent: "#EC3013", ink: "#201E1D", ground: "#F3F2F2", logo: "G" }
  }
];

// Feature-flag catalogue toggled per tenant by the Owner
export const MOCK_MODULES = [
  { id: "issue", label: "Issue & Approval", desc: "Requisition, 2-tier approval, store issue", core: true },
  { id: "reporting", label: "Reporting & Analytics", desc: "Report builder, scheduled exports, theft flags", core: true },
  { id: "b2b", label: "B2B Sales & Invoicing", desc: "Customer storefront, contract pricing, tax invoices", core: false },
  { id: "supplier", label: "Supplier Portal", desc: "PO issue, goods-received, 3-way match", core: false },
  { id: "locker", label: "Locker / Vending", desc: "Unattended issue via smart locker + vending", core: false },
  { id: "offline", label: "Offline Underground Sync", desc: "Queue scans offline, sync on surface", core: false }
];

// Wireframe 2a — separation-of-duties permission matrix (capability × role)
// value legend: "yes" = full, "no" = none, or a scope word (own/store/crew/plant/all/view)
export const PERMISSION_MATRIX = {
  roles: ["Worker", "Storeman", "Supervisor", "Manager", "Tenant Admin", "Owner"],
  rows: [
    { cap: "Request PPE", vals: ["yes", "yes", "yes", "yes", "no", "no"] },
    { cap: "Issue from store", vals: ["no", "yes", "no", "no", "no", "no"] },
    { cap: "1st approval", vals: ["no", "no", "yes", "yes", "no", "no"] },
    { cap: "2nd approval / co-sign", vals: ["no", "no", "no", "yes", "no", "no"], critical: true },
    { cap: "Stock counts / adjustments", vals: ["no", "yes", "no", "yes", "yes", "no"] },
    { cap: "Reports & exports", vals: ["own", "store", "crew", "plant", "plant", "all"] },
    { cap: "Invoicing / pricing", vals: ["no", "no", "no", "view", "yes", "yes"] },
    { cap: "Users, roles, entitlements", vals: ["no", "no", "no", "no", "yes", "no"] },
    { cap: "Branding / tenants / billing", vals: ["no", "no", "no", "no", "no", "yes"], critical: true }
  ]
};

// Wireframe 2d — what each role lands on (one app, role-based home)
export const ROLE_HOME_CARDS = [
  { role: "Worker", home: 'Big "Request PPE" + my entitlement. Nothing else.', fill: 60 },
  { role: "Storeman", home: "Scan panel + today's queue + bins below min.", fill: 75 },
  { role: "Supervisor", home: "Approvals waiting, then my crew's usage vs entitlement.", fill: 70 },
  { role: "Manager", home: "Co-sign queue, flags, spend vs budget, monthly report.", fill: 80, accent: true },
  { role: "Tenant Admin", home: "Users, entitlement rules, thresholds, catalogue, reports.", fill: 65 },
  { role: "Customer", home: "Catalogue at contract price, orders, invoices, statements.", fill: 72 }
];

// Owner-level cross-tenant audit trail — every privileged action is logged
export const MOCK_AUDIT_LOG = [
  { ts: "2026-08-10 09:21", tenant: "Plant Alpha", actor: "M. van Wyk · Tenant Admin", action: "Co-approved REQ-9014 (R980) & charged to cost centre", level: "info" },
  { ts: "2026-08-10 08:47", tenant: "Platform", actor: "You · Owner", action: "Enabled module “Supplier Portal” for Tenke Shaft 4", level: "info" },
  { ts: "2026-08-09 17:02", tenant: "Plant Alpha", actor: "System", action: "Flagged: 1 approver signed 92% of exceptions this month", level: "warn" },
  { ts: "2026-08-09 14:33", tenant: "Rand Colliery", actor: "T. Admin · Rand", action: "Changed entitlement rule: boots cycle 6→9 months", level: "info" },
  { ts: "2026-08-08 11:15", tenant: "Group HQ", actor: "You · Owner", action: "Created trial tenant & sent onboarding invite", level: "info" },
  { ts: "2026-08-08 06:00", tenant: "Plant Alpha", actor: "Scheduler", action: "Ran “Monthly consumption” → PDF+XLS to Finance, SHEQ", level: "info" }
];

// Wireframe 2c — Tenant-Admin saved reports (report builder library)
export const MOCK_SAVED_REPORTS = [
  { id: "consumption", name: "Monthly consumption", desc: "Issues per crew vs entitlement" },
  { id: "soh", name: "Stock on hand + value", desc: "Cost & selling valuation by store" },
  { id: "variance", name: "Variance / shrinkage", desc: "Physical count vs ledger" },
  { id: "costcentre", name: "Spend by cost centre", desc: "GL recovery by department" },
  { id: "exceptions", name: "Approval exceptions", desc: "Early / high-value / repeat issues" },
  { id: "leadtime", name: "Supplier lead time", desc: "PO → goods received, per supplier" }
];

// Result set backing the "Monthly consumption" report
export const MOCK_CREW_CONSUMPTION = [
  { crew: "Crew A", issues: 104, heads: 52, value: 31200, vsEntitle: 92 },
  { crew: "Crew B", issues: 118, heads: 55, value: 36900, vsEntitle: 101 },
  { crew: "Crew C", issues: 191, heads: 54, value: 61400, vsEntitle: 168, flag: true },
  { crew: "Crew D", issues: 99, heads: 51, value: 28700, vsEntitle: 88 },
  { crew: "Crew E", issues: 132, heads: 58, value: 41100, vsEntitle: 108 },
  { crew: "Crew F", issues: 87, heads: 49, value: 24300, vsEntitle: 79 }
];

// Tenant-Admin users & roles register (Level-2 scope, one plant)
export const MOCK_TENANT_USERS = [
  { id: "EM-8492", name: "John Sibanda", role: "Worker", dept: "Shaft 3 Extraction", status: "active" },
  { id: "SP-2201", name: "J. Naidoo", role: "Supervisor", dept: "Crew B", status: "active" },
  { id: "ST-1180", name: "S. Dlamini", role: "Storeman", dept: "Store 2", status: "active" },
  { id: "MG-0450", name: "M. van Wyk", role: "Manager · Tenant Admin", dept: "Plant Operations", status: "active" },
  { id: "SP-2199", name: "L. Botha", role: "Supervisor", dept: "Crew A", status: "active" },
  { id: "EM-7781", name: "P. Khumalo", role: "Worker", dept: "Shaft 1", status: "suspended" }
];

// Entitlement rules the Tenant Admin maintains (role → item class → qty → cycle)
export const MOCK_ENTITLEMENT_RULES = [
  { role: "Underground Driller", itemClass: "Safety boots", qty: 1, cycle: "6 months", threshold: "R750 → 2nd approval" },
  { role: "Underground Driller", itemClass: "Gloves (nitrile)", qty: 4, cycle: "monthly", threshold: "auto-approve" },
  { role: "Electrical Tech", itemClass: "Arc flash kit", qty: 1, cycle: "12 months", threshold: "always 2nd approval" },
  { role: "All roles", itemClass: "Dust mask FFP2", qty: 0, cycle: "unlimited", threshold: "auto-approve" }
];

/* ────────────────────────────────────────────────────────────────
   MEDUSA ADMIN — module data (commerce engine surfaced in the UI)
   ──────────────────────────────────────────────────────────────── */

// Currencies enabled for cross-border sales (multi-region)
export const MEDUSA_CURRENCIES = [
  { code: "ZAR", symbol: "R", label: "S. African Rand", rate: 1, default: true },
  { code: "USD", symbol: "$", label: "US Dollar", rate: 0.054 },
  { code: "BWP", symbol: "P", label: "Botswana Pula", rate: 0.73 },
  { code: "NAD", symbol: "N$", label: "Namibian Dollar", rate: 1 }
];

// B2B orders (derived look — powers the Orders module)
export const MEDUSA_ORDERS = [
  { id: "ord_10428", customer: "Rand Colliery", currency: "ZAR", total: 63710, items: 3, status: "captured", fulfil: "delivered", date: "2026-08-05" },
  { id: "ord_10431", customer: "Debswana (Jwaneng)", currency: "BWP", total: 41220, items: 6, status: "authorized", fulfil: "shipped", date: "2026-08-08" },
  { id: "ord_10433", customer: "Anglo Platinum", currency: "ZAR", total: 128900, items: 11, status: "captured", fulfil: "fulfilling", date: "2026-08-09" },
  { id: "ord_10440", customer: "Rössing Uranium", currency: "NAD", total: 88400, items: 8, status: "requires_action", fulfil: "not_fulfilled", date: "2026-08-10" },
  { id: "ord_10442", customer: "Rand Colliery", currency: "ZAR", total: 15980, items: 2, status: "captured", fulfil: "delivered", date: "2026-08-11" }
];

export const MEDUSA_PROMOTIONS = [
  { code: "MINE-Q3", type: "Percentage", value: "7.5% off", applies: "Contract price list B", status: "active", used: 42 },
  { code: "BULK-BOOT", type: "Buy 10 pay 9", value: "1 free / 10", applies: "Footwear", status: "active", used: 11 },
  { code: "NEWSITE", type: "Fixed", value: "R2 500 off first order", applies: "New customers", status: "scheduled", used: 0 },
  { code: "WINTER25", type: "Percentage", value: "10% off", applies: "Arc flash kit", status: "expired", used: 63 }
];

export const MEDUSA_TAX_REGIONS = [
  { region: "South Africa", code: "ZA", rate: 15, name: "VAT", default: true },
  { region: "Botswana", code: "BW", rate: 14, name: "VAT" },
  { region: "Namibia", code: "NA", rate: 15, name: "VAT" },
  { region: "Zero-rated export", code: "EXP", rate: 0, name: "Export (0%)" }
];

// B2B customer accounts with per-company spending limits
export const MEDUSA_CUSTOMERS = [
  { id: "cus_88", company: "Rand Colliery", buyers: 6, currency: "ZAR", limit: 250000, spent: 79690, taxExempt: false },
  { id: "cus_91", company: "Debswana (Jwaneng)", buyers: 12, currency: "BWP", limit: 600000, spent: 41220, taxExempt: false },
  { id: "cus_94", company: "Anglo Platinum", buyers: 21, currency: "ZAR", limit: 1000000, spent: 512400, taxExempt: false },
  { id: "cus_97", company: "Rössing Uranium", buyers: 9, currency: "NAD", limit: 400000, spent: 88400, taxExempt: true }
];

export const MEDUSA_WORKFLOWS = [
  {
    id: "issue-stock", name: "Issue stock & deduct", compensates: true, lastRun: "2026-08-12 06:41", status: "healthy", runs24h: 214,
    nodes: [
      { label: "stock.issue", type: "trigger" },
      { label: "Validate OTP", type: "action" },
      { label: "Old item returned?", type: "decision" },
      { label: "Reserve inventory", type: "action" },
      { label: "Deduct stock", type: "action" },
      { label: "Update custody", type: "action" },
      { label: "Write audit log", type: "action" },
      { label: "Issued", type: "end" }
    ]
  },
  {
    id: "approve-request", name: "Two-step approval", compensates: true, lastRun: "2026-08-12 06:36", status: "healthy", runs24h: 88,
    nodes: [
      { label: "request.submitted", type: "trigger" },
      { label: "Check thresholds", type: "action" },
      { label: "Needs co-sign?", type: "decision" },
      { label: "Notify approver", type: "action" },
      { label: "Await signature", type: "action" },
      { label: "Generate OTP", type: "action" },
      { label: "Approved", type: "end" }
    ]
  },
  {
    id: "quote-to-invoice", name: "Quote → tax invoice", compensates: true, lastRun: "2026-08-11 17:02", status: "healthy", runs24h: 12,
    nodes: [
      { label: "quote.accepted", type: "trigger" },
      { label: "Price on list B", type: "action" },
      { label: "Apply tax", type: "action" },
      { label: "Create order", type: "action" },
      { label: "Render PDF", type: "action" },
      { label: "Email customer", type: "action" },
      { label: "Invoiced", type: "end" }
    ]
  },
  {
    id: "capture-payment", name: "Capture payment", compensates: true, lastRun: "2026-08-11 16:20", status: "retrying", runs24h: 9,
    nodes: [
      { label: "invoice.due", type: "trigger" },
      { label: "Create session", type: "action" },
      { label: "Capture", type: "action" },
      { label: "Success?", type: "decision" },
      { label: "Mark paid", type: "action" },
      { label: "Paid", type: "end" }
    ]
  }
];

/* Variant options (lowest-level SKU = size × colour) derived by category */
export const getVariantOptions = (product) => {
  const c = product.category || "";
  if (c === "Footwear") return { sizes: ["6", "7", "8", "9", "10", "11", "12"], colors: ["Black", "Tan"] };
  if (c === "Workwear") return { sizes: ["S", "M", "L", "XL", "2XL", "3XL"], colors: ["Navy", "Hi-vis orange", "Charcoal"] };
  if (c === "Hand Protection") return { sizes: ["7", "8", "9", "10", "11"], colors: ["—"] };
  if (c === "Arc Flash Protection") return { sizes: ["M", "L", "XL", "2XL"], colors: ["Navy"] };
  return { sizes: ["One size"], colors: ["—"] };
};

// Build a per-variant stock split for a product (size × colour grid)
export const buildVariants = (product) => {
  const { sizes, colors } = getVariantOptions(product);
  const combos = [];
  sizes.forEach(s => colors.forEach(col => combos.push({ size: s, color: col })));
  const base = Math.max(0, Math.floor(product.stockOnHand / combos.length));
  return combos.map((v, i) => {
    // bell-ish distribution: mid sizes hold more stock
    const mid = Math.abs(i - combos.length / 2);
    const qty = Math.max(0, base + (mid < combos.length / 4 ? 3 : -1) + ((i * 7) % 4) - 1);
    const colorTag = v.color === "—" ? "" : `-${v.color.split(" ")[0].slice(0, 3).toUpperCase()}`;
    return {
      ...v,
      sku: `${product.sku}-${v.size}${colorTag}`,
      stock: qty
    };
  });
};

export const MEDUSA_EVENTS = [
  { event: "order.placed", subscribers: ["send-confirmation", "post-to-teams", "reserve-inventory"], last: "19:41" },
  { event: "request.approved", subscribers: ["generate-pickup-otp", "push-worker"], last: "19:36" },
  { event: "stock.issued", subscribers: ["deduct-inventory", "update-custody", "audit-log"], last: "19:41" },
  { event: "invoice.created", subscribers: ["email-pdf", "sync-finance"], last: "17:02" },
  { event: "payment.captured", subscribers: ["mark-order-paid", "audit-log"], last: "16:20" }
];

export const MEDUSA_FULFILMENT = [
  { provider: "Manual (store handover)", regions: "All sites", rate: "R 0", eta: "same-day", enabled: true },
  { provider: "Courier Guy", regions: "ZA national", rate: "R 95 / R 480 heavy", eta: "1–3 days", enabled: true },
  { provider: "DSV Road", regions: "SADC cross-border", rate: "quoted", eta: "3–7 days", enabled: true },
  { provider: "Aramex", regions: "International", rate: "quoted", eta: "5–10 days", enabled: false }
];
