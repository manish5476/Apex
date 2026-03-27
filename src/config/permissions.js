/**
 * PERMISSIONS — single source of truth
 * Define once here; everything else is auto-generated.
 */

const p = (tag, group, description) => ({ tag, group, description });

const PERMISSIONS_LIST = [
  // ── System ────────────────────────────────────────────────────────
  p("user:read",                  "System",       "View Users & Organization Hierarchy"),
  p("user:manage",                "System",       "Manage Users, Statuses, and Admin Actions"),
  p("role:manage",                "System",       "Manage Roles"),
  p("session:view_all",           "System",       "View All System Sessions"),
  p("master:read",                "System",       "View Master Data lists and filters"),
  p("master:manage",              "System",       "Export and manage Master Data"),
  p("logs:view",                  "System",       "Read server-side system and error logs"),
  p("system:manage",              "System",       "Manage background jobs, cache, and system status"),
  p("automation:read",            "System",       "View configured workflows and webhooks"),
  p("automation:webhook",         "System",       "Manage incoming and outgoing webhooks"),
  p("automation:workflow",        "System",       "Create and edit internal automation workflows"),
  p("ai:chat",                    "System",       "Interact with the AI assistant for data queries"),

  // ── Security & Settings ───────────────────────────────────────────
  p("auth:manage_sessions",       "Security",     "View and terminate active login sessions"),
  p("asset:read",                 "Settings",     "View Media Gallery & Storage Statistics"),
  p("asset:delete",               "Settings",     "Permanently Delete Media Assets (High Risk)"),
  
  // ── Organization ──────────────────────────────────────────────────
  p("org:manage",                 "Organization", "Manage Own Organization"),
  p("org:manage_members",         "Organization", "Invite/Remove Members"),
  p("org:manage_platform",        "Organization", "SuperAdmin — Manage Orgs"),
  p("org:transfer",               "Organization", "Transfer Ownership"),
  p("ownership:transfer",         "Organization", "Transfer organization ownership"),
  p("branch:read",                "Organization", "View branch lists and details"),
  p("branch:manage",              "Organization", "Create, Update, and Delete branches"),
  p("department:read",            "Organization", "View department lists, hierarchy, and basic stats"),
  p("department:manage",          "Organization", "Create, edit, delete, and bulk-update departments"),
  p("designation:read",           "Organization", "View job titles, hierarchy, and career paths"),
  p("designation:manage",         "Organization", "Create job titles, set salary bands, and promotion criteria"),

  // ── HR & Attendance ───────────────────────────────────────────────
  p("attendance:read",            "HR",           "View personal and team attendance records"),
  p("attendance:manage",          "HR",           "Edit, recalculate, and export company-wide attendance"),
  p("attendance:regularize",      "HR",           "Approve or apply for attendance corrections"),
  p("attendance:log_read",        "HR",           "View raw clock-in/out logs and realtime feeds"),
  p("attendance:log_manage",      "HR",           "Verify, flag, or correct raw biometric logs"),
  p("attendance:machine_read",    "HR",           "View biometric machine status and logs"),
  p("attendance:machine_manage",  "HR",           "Register machines, map users, and regenerate API keys"),
  p("attendance:geofence_read",   "HR",           "View geofence zones, statistics, and location violations"),
  p("attendance:geofence_manage", "HR",           "Create, update, delete geofences and assign them"),
  p("holiday:read",               "HR",           "View the holiday calendar and upcoming company holidays"),
  p("holiday:manage",             "HR",           "Create, edit, and bulk-import holidays"),
  p("shift:read",                 "HR",           "View shift definitions, timelines, and coverage reports"),
  p("shift:manage",               "HR",           "Create, edit, and clone shift templates and duty rotations"),
  p("shift:group_read",           "HR",           "View shift group definitions and member assignments"),
  p("shift:group_manage",         "HR",           "Create shift groups, assign users, and generate rotation schedules"),
  p("leave:balance_read",         "HR",           "View personal or company-wide leave balances and reports"),
  p("leave:balance_manage",       "HR",           "Initialize, manually update, or trigger monthly leave accruals"),
  p("leave:read",                 "HR",           "View personal and team leave history"),
  p("leave:request",              "HR",           "Apply for and manage personal leave requests"),
  p("leave:approve",              "HR",           "Approve, reject, or escalate leave requests"),
  p("leave:admin",                "HR",           "Access leave analytics and bulk approval tools"),

  // ── Finance & Billing ─────────────────────────────────────────────
  p("statement:read",             "Finance",      "View Statements (P&L, Balance Sheet, Trial Balance)"),
  p("transaction:read",           "Finance",      "View Transactions"),
  p("reconciliation:read",        "Finance",      "Reconciliation Reporting"),
  p("reconciliation:manage",      "Finance",      "Perform reconciliations"),
  p("payment:read",               "Finance",      "View Payments & Reports"),
  p("payment:create",             "Finance",      "Record Payments"),
  p("payment:update",             "Finance",      "Update & Allocate payment records"),
  p("payment:delete",             "Finance",      "Delete Payments"),
  p("ledger:read",                "Finance",      "View General Ledger and Financial Statements"),
  p("ledger:delete",              "Finance",      "Delete/Void Ledger Entries"),
  p("emi:read",                   "Finance",      "View EMI plans and schedules"),
  p("emi:create",                 "Finance",      "Create new EMI/Loan plans"),
  p("emi:pay",                    "Finance",      "Process installment payments"),
  p("emi:manage",                 "Finance",      "Delete plans and mark overdue"),
  p("account:read",               "Finance",      "View the Chart of Accounts list"),
  p("account:manage",             "Finance",      "Create, Edit, Delete, and Restructure Accounts"),
  p("invoice:read",               "Billing",      "View invoices and analytics"),
  p("invoice:create",             "Billing",      "Create new invoices"),
  p("invoice:update",             "Billing",      "Edit/Cancel invoices"),
  p("invoice:delete",             "Billing",      "Delete/Trash invoices"),
  p("invoice:download",           "Billing",      "Download PDF or Email Invoices to Customers"),
  p("invoice:export",             "Billing",      "Export invoice data"),

  // ── Inventory & Products ──────────────────────────────────────────
  p("stock:read",                 "Inventory",    "View stock information, movements, and aging"),
  p("stock:manage",               "Inventory",    "Manage stock transfers and adjustments"),
  p("stock:low_stock",            "Inventory",    "View low stock alerts"),
  p("stock:validate",             "Inventory",    "Validate Stock Before Sales"),
  p("stock:warnings",             "Inventory",    "View Low Stock Warnings"),
  p("supplier:read",              "Inventory",    "View Suppliers & Dashboards"),
  p("supplier:create",            "Inventory",    "Create Suppliers (Single/Bulk)"),
  p("supplier:update",            "Inventory",    "Edit Suppliers & Manage KYC"),
  p("supplier:delete",            "Inventory",    "Delete Suppliers"),
  p("product:read",               "Inventory",    "View Products"),
  p("product:create",             "Inventory",    "Create Products"),
  p("product:update",             "Inventory",    "Edit Products"),
  p("product:delete",             "Inventory",    "Delete Products"),
  p("product:stock_adjust",       "Inventory",    "Manual Stock Adjustment (Correcting Errors)"),

  // ── Sales & Purchase ──────────────────────────────────────────────
  p("sales:manage",               "Sales",        "Manage Direct Sales"),
  p("sales:view",                 "Sales",        "View Sales & Exports"),
  p("sales_return:read",          "Sales",        "View sales returns"),
  p("sales_return:manage",        "Sales",        "Create/process sales returns"),
  p("purchase:read",              "Purchase",     "View purchase records"),
  p("purchase:create",            "Purchase",     "Record new purchases"),
  p("purchase:update",            "Purchase",     "Modify purchase records"),
  p("purchase:delete",            "Purchase",     "Delete purchases"),
  p("purchase:cancel",            "Purchase",     "Cancel entire purchases"),
  p("purchase:return",            "Purchase",     "Process partial returns"),
  p("purchase:create_payment",    "Purchase",     "Create Purchase Payment"),
  p("purchase:payment:view",      "Purchase",     "View payment history"),
  p("purchase:payment:delete",    "Purchase",     "Delete/void payments"),
  p("purchase:status:update",     "Purchase",     "Update purchase status"),
  p("purchase:attachment:upload", "Purchase",     "Upload purchase attachments"),
  p("purchase:attachment:delete", "Purchase",     "Delete purchase attachments"),
  p("purchase:bulk:update",       "Purchase",     "Bulk update purchases"),
  p("purchase:analytics:view",    "Purchase",     "View purchase analytics"),

  // ── CRM & Analytics ───────────────────────────────────────────────
  p("customer:read",              "CRM",          "View customer profiles and history"),
  p("customer:create",            "CRM",          "Register new customers"),
  p("customer:update",            "CRM",          "Edit customer details"),
  p("customer:delete",            "CRM",          "Archive/Delete customers"),
  p("customer:credit_limit",      "CRM",          "Modify customer credit terms and limits"),
  p("analytics:read",             "Analytics",    "View Analytics Dashboards, Charts & visual trends"),
  p("analytics:emi_read",         "Analytics",    "View sensitive EMI and debt-related analytics"),
  p("analytics:export",           "Analytics",    "Export raw analytical data to CSV/Excel"),
  p("analytics:view_executive",   "Analytics",    "Full access to executive dashboards and system health"),
  p("analytics:view_financial",   "Analytics",    "Access to revenue, cash flow, and EMI analytics"),
  p("analytics:view_branch_comparison","Analytics","Compare performance metrics across different branches"),
  p("analytics:view_customer_segmentation","Analytics","View RFM segmentation and customer intelligence"),
  p("analytics:view_customer_ltv","Analytics",    "View customer lifetime value and tier analysis"),
  p("analytics:view_churn",       "Analytics",    "Access churn risk and inactivity reports"),
  p("analytics:view_inventory",   "Analytics",    "Full inventory health and valuation dashboards"),
  p("analytics:view_stock_forecast","Analytics",  "View stock-out and reorder predictions"),
  p("analytics:view_operational", "Analytics",    "Access efficiency, peak hours, and time-based metrics"),
  p("analytics:view_staff_performance","Analytics","Monitor individual staff sales and productivity"),
  p("analytics:view_forecast",    "Analytics",    "Access predictive sales and revenue models"),
  p("analytics:view_alerts",      "Analytics",    "Monitor real-time business and system alerts"),
  p("analytics:view_security_audit","Analytics",  "Access security logs and compliance dashboards"),
  p("analytics:export_data",      "Analytics",    "Permission to export raw analytics data to CSV/External tools"),
  p("dashboard:view",             "General",      "Access the main overview dashboard and KPIs"),

  // ── Reports ───────────────────────────────────────────────────────
  p("report:profit",              "Reports",      "View profit reports"),
  p("report:sales",               "Reports",      "View sales reports"),
  p("report:tax",                 "Reports",      "View tax reports"),
  p("report:outstanding",         "Reports",      "View outstanding invoice reports"),

  // ── Communication & Collaboration ─────────────────────────────────
  p("notification:read",          "Communication","View Notifications"),
  p("notification:manage",        "Communication","Clear/Delete Notifications"),
  p("feed:read",                  "Communication","View customer activity timelines and feeds"),
  p("chat:read",                  "Communication","View channels and read messages"),
  p("chat:send",                  "Communication","Send messages and upload attachments"),
  p("chat:delete",                "Communication","Delete own messages"),
  p("chat:manage_channel",        "Communication","Create/Disable channels and manage members"),
  p("announcement:read",          "Communication","View and interact with announcements"),
  p("announcement:manage",        "Communication","Create, Edit, and Delete announcements"),
  p("meeting:schedule",           "Meetings",     "Schedule new meetings"),
  p("meeting:read",               "Meetings",     "View meetings and meeting notes"),
  p("meeting:write",              "Meetings",     "Create and update meetings"),
  p("meeting:rsvp",               "Meetings",     "Accept/decline meeting invitations"),

  // ── Files & Notes & Tasks ─────────────────────────────────────────
  p("file:upload",                "Files",        "Upload files to notes and meetings"),
  p("task:create",                "Tasks",        "Create new tasks"),
  p("note:read",                  "Notes",        "View notes, tasks, and journal entries"),
  p("note:write",                 "Notes",        "Create and update notes"),
  p("note:delete",                "Notes",        "Delete notes"),
  p("note:view_analytics",        "Notes",        "View note analytics and heat maps"),
  p("note:view_calendar",         "Notes",        "View calendar with notes and meetings"),
  p("note:export_data",           "Notes",        "Export note data"),
  p("note:create_template",       "Notes",        "Create note templates"),
  p("note:use_template",          "Notes",        "Use existing templates"),
  p("note:bulk_update",           "Notes",        "Update multiple notes at once"),
  p("note:bulk_delete",           "Notes",        "Delete multiple notes at once"),
  p("note:share",                 "Notes",        "Share notes with other users"),
  p("note:manage_shared",         "Notes",        "Manage access to shared notes"),
  p("note:pin",                   "Notes",        "Pin important notes"),
  
  // ── Global Search ─────────────────────────────────────────────────
  p("search:global",              "Search",       "Use Global Search"),
];

// ── Auto-generate everything below — never edit manually ────────────

const VALID_TAGS = [
  "*",                                          // superuser wildcard
  ...PERMISSIONS_LIST.map(x => x.tag),          // every concrete tag
  ...[...new Set(                               // category wildcards e.g. "leave:*"
    PERMISSIONS_LIST.map(x => x.tag.split(":")[0])
  )].map(cat => `${cat}:*`),
];

// PERMISSIONS.ROLE.MANAGE → "role:manage"  (used in routes / controllers)
const PERMISSIONS = {};
PERMISSIONS_LIST.forEach(({ tag }) => {
  const [resource, ...rest] = tag.split(":");
  const R = resource.toUpperCase().replace(/-/g, "_");
  const A = rest.join("_").toUpperCase().replace(/-/g, "_");
  (PERMISSIONS[R] ??= {})[A] = tag;
});

// ── Helper functions ───────────────────────────────────────────────

const hasPermission = (userPerms, required) => {
  if (!userPerms?.length) return false;
  if (userPerms.includes("*"))        return true;  // owner wildcard
  if (userPerms.includes(required))   return true;  // exact match
  const [cat] = required.split(":");
  return userPerms.includes(`${cat}:*`);            // category wildcard
};

const hasAnyPermission = (userPerms, required) =>
  required.some(r => hasPermission(userPerms, r));

const hasAllPermissions = (userPerms, required) =>
  required.every(r => hasPermission(userPerms, r));

const getPermissionsByGroup = group =>
  PERMISSIONS_LIST.filter(p => p.group === group);

const getPermissionGroups = () =>
  [...new Set(PERMISSIONS_LIST.map(p => p.group))];

module.exports = {
  PERMISSIONS,
  PERMISSIONS_LIST,
  VALID_TAGS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getPermissionsByGroup,
  getPermissionGroups,
};









// /**
//  * PERMISSIONS SYSTEM CONFIGURATION
//  * This file serves as the single source of truth for all access control tags.
//  */

// const PERMISSIONS_LIST = [
//   // USERS
//   { tag: "user:read", group: "System", description: "View Users & Organization Hierarchy" },
//   { tag: "user:manage", group: "System", description: "Manage Users, Statuses, and Admin Actions" },
//   // STATEMENTS
//   { tag: "statement:read", group: "Finance", description: "View Statements (P&L, Balance Sheet, Trial Balance)" },
  
//   // STOCK MANAGEMENT
//   { tag: "stock:read", group: "Inventory", description: "View stock information, movements, and aging" },
//   { tag: "stock:manage", group: "Inventory", description: "Manage stock transfers and reorder levels" },
//   { tag: "stock:low_stock", group: "Inventory", description: "View low stock alerts" },
//   { tag: "stock:validate", group: "Inventory", description: "Validate Stock Before Sales" },
//   { tag: "stock:warnings", group: "Inventory", description: "View Low Stock Warnings" },
//   // ASSETS & MEDIA GALLERY
//   { tag: "asset:read", group: "Settings", description: "View Media Gallery & Storage Statistics" },
//   { tag: "asset:delete", group: "Settings", description: "Permanently Delete Media Assets (High Risk)" },
//   // SUPPLIERS
//   { tag: "supplier:read", group: "Inventory", description: "View Suppliers & Dashboards" },
//   { tag: "supplier:create", group: "Inventory", description: "Create Suppliers (Single/Bulk)" },
//   { tag: "supplier:update", group: "Inventory", description: "Edit Suppliers & Manage KYC" },
//   { tag: "supplier:delete", group: "Inventory", description: "Delete Suppliers" },
  
//   // TRANSACTIONS
//   { tag: "transaction:read", group: "Finance", description: "View Transactions" },
  
// // SESSIONS
//   { tag: "session:view_all", group: "System", description: "View All System Sessions" },
//   // Note: The rest use the user:manage tag which we already defined!
//   // SEARCH
//   { tag: "search:global", group: "Search", description: "Use Global Search" },
//   // SALES
//   { tag: "sales:manage", group: "Sales", description: "Manage Direct Sales" },
//   { tag: "sales:view", group: "Sales", description: "View Sales & Exports" },

//   // SALES RETURNS
//   { tag: "sales_return:read", group: "Sales", description: "View sales returns" },
//   { tag: "sales_return:manage", group: "Sales", description: "Create/process sales returns" },
//   // SALES RETURNS
//   { tag: "sales_return:read", group: "Sales", description: "View sales returns" },
//   { tag: "sales_return:manage", group: "Sales", description: "Create/process sales returns" },
  
//   // ROLES
//   { tag: "role:manage", group: "System", description: "Manage Roles" },
//   // RECONCILIATION
//   { tag: "reconciliation:read", group: "Finance", description: "Reconciliation Reporting" },
//   { tag: "reconciliation:manage", group: "Finance", description: "Perform reconciliations" },


//   // PURCHASE PERMISSIONS
//   { tag: "purchase:read", group: "Purchase", description: "View purchase records" },
//   { tag: "purchase:create", group: "Purchase", description: "Record new purchases" },
//   { tag: "purchase:update", group: "Purchase", description: "Modify purchase records" },
//   { tag: "purchase:delete", group: "Purchase", description: "Delete purchases" },
//   { tag: "purchase:cancel", group: "Purchase", description: "Cancel entire purchases" },
//   { tag: "purchase:return", group: "Purchase", description: "Process partial returns" },
  
//   // SPECIFIC ACTIONS
//   { tag: "purchase:create_payment", group: "Purchase", description: "Create Purchase Payment" }, 
//   { tag: "purchase:payment:view", group: "Purchase", description: "View payment history" },
//   { tag: "purchase:payment:delete", group: "Purchase", description: "Delete/void payments" },
//   { tag: "purchase:status:update", group: "Purchase", description: "Update purchase status" },
//   { tag: "purchase:attachment:upload", group: "Purchase", description: "Upload purchase attachments" },
//   { tag: "purchase:attachment:delete", group: "Purchase", description: "Delete purchase attachments" },
//   { tag: "purchase:bulk:update", group: "Purchase", description: "Bulk update purchases" },
//   { tag: "purchase:analytics:view", group: "Purchase", description: "View purchase analytics" },
//   // PRODUCTS
//   { tag: "product:read", group: "Inventory", description: "View Products" },
//   { tag: "product:create", group: "Inventory", description: "Create Products" },
//   { tag: "product:update", group: "Inventory", description: "Edit Products" },
//   { tag: "product:delete", group: "Inventory", description: "Delete Products" },
//   { tag: "product:stock_adjust", group: "Inventory", description: "Manual Stock Adjustment" },
  
//   // STOCK (Used for the transfer route)
//   { tag: "stock:manage", group: "Inventory", description: "Manage stock transfers and adjustments" },
//   // PAYMENTS
//   { tag: "payment:read", group: "Finance", description: "View Payments & Reports" },
//   { tag: "payment:create", group: "Finance", description: "Record Payments" },
//   { tag: "payment:update", group: "Finance", description: "Update & Allocate payment records" },
//   { tag: "payment:delete", group: "Finance", description: "Delete Payments" },

//   // TRANSACTIONS
//   { tag: "transaction:read", group: "Finance", description: "View Transactions" },
//   // ORGANIZATION OWNERSHIP
//   { tag: "ownership:transfer", group: "Organization", description: "Transfer organization ownership" },
//   // ORGANIZATION MANAGEMENT

//   { tag: "org:manage", group: "Organization", description: "Manage Own Organization" },
//   { tag: "org:manage_members", group: "Organization", description: "Invite/Remove Members" },
//   { tag: "org:manage_platform", group: "Organization", description: "SuperAdmin — Manage Orgs" },
//   // ORGANIZATION MANAGEMENT

//   { tag: "org:transfer", group: "Organization", description: "Transfer Ownership" },
//   { tag: "org:manage_members", group: "Organization", description: "Invite/Remove Members" },
//   { tag: "org:manage", group: "Organization", description: "Manage Own Organization" },
//   // NOTIFICATIONS
//   { tag: "notification:read", group: "Communication", description: "View Notifications" },
//   { tag: "notification:manage", group: "Communication", description: "Clear/Delete Notifications" }, // (Admin level creation)

//   // FILES
//   { tag: "file:upload", group: "Files", description: "Upload files to notes and meetings" },

//   // NOTES (Core)
//   { tag: "note:read", group: "Notes", description: "View notes, tasks, and journal entries" },
//   { tag: "note:write", group: "Notes", description: "Create and update notes" },
//   { tag: "note:delete", group: "Notes", description: "Delete notes" },
  
//   // NOTES (Advanced Features)
//   { tag: "note:view_analytics", group: "Notes", description: "View note analytics and heat maps" },
//   { tag: "note:view_calendar", group: "Notes", description: "View calendar with notes and meetings" },
//   { tag: "note:export_data", group: "Notes", description: "Export note data" },
//   { tag: "note:create_template", group: "Notes", description: "Create note templates" },
//   { tag: "note:use_template", group: "Notes", description: "Use existing templates" },
//   { tag: "note:bulk_update", group: "Notes", description: "Update multiple notes at once" },
//   { tag: "note:bulk_delete", group: "Notes", description: "Delete multiple notes at once" },
//   { tag: "note:share", group: "Notes", description: "Share notes with other users" },
//   { tag: "note:manage_shared", group: "Notes", description: "Manage access to shared notes" },
//   { tag: "note:pin", group: "Notes", description: "Pin important notes" },

//   // CROSS-DOMAIN
//   { tag: "analytics:read", group: "Analytics", description: "View Analytics Dashboards & Charts" },
//   { tag: "meeting:schedule", group: "Meetings", description: "Schedule new meetings" },
//   { tag: "meeting:read", group: "Meetings", description: "View meetings and meeting notes" },
//   { tag: "meeting:write", group: "Meetings", description: "Create and update meetings" },
//   { tag: "meeting:rsvp", group: "Meetings", description: "Accept/decline meeting invitations" },
//   { tag: "task:create", group: "Tasks", description: "Create new tasks" },

//   // MASTER DATA
//   { tag: "master:read", group: "System", description: "View Master Data" },
//   { tag: "master:manage", group: "System", description: "Manage Master Data" },

//   // MASTER DATA
//   { tag: "master:read", group: "System", description: "View Master Data lists and filters" },
//   { tag: "master:manage", group: "System", description: "Export and manage Master Data" },

//   // SYSTEM LOGS
//   { tag: "logs:view", group: "System", description: "Read server-side system and error logs" },

//   // LEDGER PERMISSIONS
//   { tag: "ledger:read", group: "Finance", description: "View General Ledger and Financial Statements" },
//   { tag: "ledger:delete", group: "Finance", description: "Delete/Void Ledger Entries" },

//   // INVOICES
//   { tag: "invoice:read", group: "Billing", description: "View invoices and analytics" },
//   { tag: "invoice:create", group: "Billing", description: "Create new invoices" },
//   { tag: "invoice:update", group: "Billing", description: "Edit/Cancel invoices" },
//   { tag: "invoice:delete", group: "Billing", description: "Delete/Trash invoices" },
//   { tag: "invoice:download", group: "Billing", description: "Download/Email PDFs" },
//   { tag: "invoice:export", group: "Billing", description: "Export invoice data" },

//   // REPORTS (Granular)
//   { tag: "report:profit", group: "Reports", description: "View profit reports" },
//   { tag: "report:sales", group: "Reports", description: "View sales reports" },
//   { tag: "report:tax", group: "Reports", description: "View tax reports" },
//   { tag: "report:outstanding", group: "Reports", description: "View outstanding invoice reports" },

//   // INVOICE OUTPUTS
//   { tag: "invoice:download", group: "Billing", description: "Download PDF or Email Invoices to Customers" },
// // INVENTORY MOVEMENTS
//   { tag: "product:stock_adjust", group: "Inventory", description: "Manual Stock Adjustment (Correcting Errors)" },
//   { tag: "stock:manage", group: "Inventory", description: "Manage stock transfers between locations" },

// // ACTIVITY FEEDS
//   { tag: "feed:read", group: "Communication", description: "View customer activity timelines and feeds" },

//   // EMI & INSTALLMENTS
//   { tag: "emi:read", group: "Finance", description: "View EMI plans and schedules" },
//   { tag: "emi:create", group: "Finance", description: "Create new EMI/Loan plans" },
//   { tag: "emi:pay", group: "Finance", description: "Process installment payments" },
//   { tag: "emi:manage", group: "Finance", description: "Delete plans and mark overdue" },
//   // DASHBOARD
//   { tag: "dashboard:view", group: "General", description: "Access the main overview dashboard and KPIs" },
//   // CUSTOMERS
//   { tag: "customer:read", group: "CRM", description: "View customer profiles and history" },
//   { tag: "customer:create", group: "CRM", description: "Register new customers" },
//   { tag: "customer:update", group: "CRM", description: "Edit customer details" },
//   { tag: "customer:delete", group: "CRM", description: "Archive/Delete customers" },
//   { tag: "customer:credit_limit", group: "CRM", description: "Modify customer credit terms and limits" },

// // ANALYTICS
//   { tag: "analytics:read", group: "Analytics", description: "View general customer and financial dashboards" },
//   { tag: "analytics:emi_read", group: "Analytics", description: "View sensitive EMI and debt-related analytics" },
//   { tag: "analytics:export", group: "Analytics", description: "Export raw analytical data to CSV/Excel" },

// // SYSTEM OPERATIONS
//   { tag: "system:manage", group: "System", description: "Manage background jobs, cache, and system status" },

// // CHAT & COLLABORATION
//   { tag: "chat:read", group: "Communication", description: "View channels and read messages" },
//   { tag: "chat:send", group: "Communication", description: "Send messages and upload attachments" },
//   { tag: "chat:delete", group: "Communication", description: "Delete own messages" },
//   { tag: "chat:manage_channel", group: "Communication", description: "Create/Disable channels and manage members" },
//   // CHART ANALYTICS
//   { tag: "analytics:read", group: "Analytics", description: "View dashboard charts and visual performance trends" },

// // BRANCH MANAGEMENT
//   { tag: "branch:read", group: "Organization", description: "View branch lists and details" },
//   { tag: "branch:manage", group: "Organization", description: "Create, Update, and Delete branches" },

//   // AUTOMATION & INTEGRATION
//   { tag: "automation:read", group: "System", description: "View configured workflows and webhooks" },
//   { tag: "automation:webhook", group: "System", description: "Manage incoming and outgoing webhooks" },
//   { tag: "automation:workflow", group: "System", description: "Create and edit internal automation workflows" },

// // USER SECURITY
//   { tag: "auth:manage_sessions", group: "Security", description: "View and terminate active login sessions" },

//   // ANNOUNCEMENTS
//   { tag: "announcement:read", group: "Communication", description: "View and interact with announcements" },
//   { tag: "announcement:manage", group: "Communication", description: "Create, Edit, and Delete announcements" },

// // AI & AUTOMATION
//   { tag: "ai:chat", group: "System", description: "Interact with the AI assistant for data queries and automation" },

// // ADMINISTRATIVE ANALYTICS
//   { tag: "analytics:view_executive", group: "Analytics", description: "View top-level company KPIs and branch performance" },
//   { tag: "analytics:view_financial", group: "Analytics", description: "View monthly trends and outstanding debt reports" },


// // CHART OF ACCOUNTS
//   { tag: "account:read", group: "Finance", description: "View the Chart of Accounts list" },
//   { tag: "account:manage", group: "Finance", description: "Create, Edit, Delete, and Restructure Accounts" },
//   // ANALYTICS & BUSINESS INTELLIGENCE
//   { tag: "analytics:view_executive", group: "Analytics", description: "Full access to executive dashboards and system health" },
//   { tag: "analytics:view_financial", group: "Analytics", description: "Access to revenue, cash flow, and EMI analytics" },
//   { tag: "analytics:view_branch_comparison", group: "Analytics", description: "Compare performance metrics across different branches" },
//   { tag: "analytics:view_customer_segmentation", group: "Analytics", description: "View RFM segmentation and customer intelligence" },
//   { tag: "analytics:view_customer_ltv", group: "Analytics", description: "View customer lifetime value and tier analysis" },
//   { tag: "analytics:view_churn", group: "Analytics", description: "Access churn risk and inactivity reports" },
//   { tag: "analytics:view_inventory", group: "Analytics", description: "Full inventory health and valuation dashboards" },
//   { tag: "analytics:view_stock_forecast", group: "Analytics", description: "View stock-out and reorder predictions" },
//   { tag: "analytics:view_operational", group: "Analytics", description: "Access efficiency, peak hours, and time-based metrics" },
//   { tag: "analytics:view_staff_performance", group: "Analytics", description: "Monitor individual staff sales and productivity" },
//   { tag: "analytics:view_forecast", group: "Analytics", description: "Access predictive sales and revenue models" },
//   { tag: "analytics:view_alerts", group: "Analytics", description: "Monitor real-time business and system alerts" },
//   { tag: "analytics:view_security_audit", group: "Analytics", description: "Access security logs and compliance dashboards" },
//   { tag: "analytics:export_data", group: "Analytics", description: "Permission to export raw analytics data to CSV/External tools" },
// // ATTENDANCE & HR
//   { tag: "attendance:read", group: "HR", description: "View personal and team attendance records" },
//   { tag: "attendance:manage", group: "HR", description: "Edit, recalculate, and export company-wide attendance" },
//   { tag: "attendance:regularize", group: "HR", description: "Approve or apply for attendance corrections" },

// // ATTENDANCE LOGS
//   { tag: "attendance:log_read", group: "HR", description: "View raw clock-in/out logs and realtime feeds" },
//   { tag: "attendance:log_manage", group: "HR", description: "Verify, flag, or correct raw biometric logs" },

// // ATTENDANCE HARDWARE
//   { tag: "attendance:machine_read", group: "HR", description: "View biometric machine status and logs" },
//   { tag: "attendance:machine_manage", group: "HR", description: "Register machines, map users, and regenerate API keys" },
// // GEOFENCING & LOCATION
//   { tag: "attendance:geofence_read", group: "HR", description: "View geofence zones, statistics, and location violations" },
//   { tag: "attendance:geofence_manage", group: "HR", description: "Create, update, delete geofences and assign them to users/departments" },
//   // HOLIDAYS & CALENDAR
//   { tag: "holiday:read", group: "HR", description: "View the holiday calendar and upcoming company holidays" },
//   { tag: "holiday:manage", group: "HR", description: "Create, edit, and bulk-import holidays or copy calendar from previous years" },

//   // DEPARTMENT MANAGEMENT
//   { tag: "department:read", group: "Organization", description: "View department lists, hierarchy, and basic stats" },
//   { tag: "department:manage", group: "Organization", description: "Create, edit, delete, and bulk-update departments" },

// // DESIGNATION & CAREER
//   { tag: "designation:read", group: "Organization", description: "View job titles, hierarchy, and career paths" },
//   { tag: "designation:manage", group: "Organization", description: "Create job titles, set salary bands, and define promotion criteria" },
//   // SHIFT & ROSTERING
//   { tag: "shift:read", group: "HR", description: "View shift definitions, timelines, and coverage reports" },
//   { tag: "shift:manage", group: "HR", description: "Create, edit, and clone shift templates and duty rotations" },

//   // SHIFT GROUPS & ROTATIONS
//   { tag: "shift:group_read", group: "HR", description: "View shift group definitions and member assignments" },
//   { tag: "shift:group_manage", group: "HR", description: "Create shift groups, assign users, and generate rotation schedules" },

//   // LEAVE BALANCES
//   { tag: "leave:balance_read", group: "HR", description: "View personal or company-wide leave balances and reports" },
//   { tag: "leave:balance_manage", group: "HR", description: "Initialize, manually update, or trigger monthly leave accruals" },
// // LEAVE REQUESTS
//   { tag: "leave:read", group: "HR", description: "View personal and team leave history" },
//   { tag: "leave:request", group: "HR", description: "Apply for and manage personal leave requests" },
//   { tag: "leave:approve", group: "HR", description: "Approve, reject, or escalate leave requests for direct reports or company-wide" },
//   { tag: "leave:admin", group: "HR", description: "Access leave analytics and bulk approval tools" },
// ];

// /**
//  * LOGIC GENERATION
//  */

// // 1. Generate set of all valid tags (including wildcards)
// const VALID_TAGS = PERMISSIONS_LIST.map((p) => p.tag);
// VALID_TAGS.push("*");

// const categorySet = new Set();
// PERMISSIONS_LIST.forEach((p) => {
//     const [category] = p.tag.split(":");
//     categorySet.add(category);
// });

// categorySet.forEach((category) => {
//     VALID_TAGS.push(`${category}:*`);
// });

// // 2. Build the PERMISSIONS object constant (e.g. PERMISSIONS.USER.READ)
// const PERMISSIONS = {};
// PERMISSIONS_LIST.forEach((p) => {
//     const parts = p.tag.split(":");
//     const resource = parts[0].toUpperCase().replace(/-/g, "_");
//     const action = parts.slice(1).join("_").toUpperCase().replace(/-/g, "_");

//     if (!PERMISSIONS[resource]) PERMISSIONS[resource] = {};
//     PERMISSIONS[resource][action] = p.tag;
// });

// /**
//  * HELPER FUNCTIONS
//  */

// const hasPermission = (userPermissions, requiredPermission) => {
//     if (!userPermissions || !userPermissions.length) return false;
//     if (userPermissions.includes("*")) return true;
//     if (userPermissions.includes(requiredPermission)) return true;

//     const [category] = requiredPermission.split(":");
//     if (userPermissions.includes(`${category}:*`)) return true;

//     return false;
// };

// const hasAnyPermission = (userPermissions, requiredPermissions) => {
//     return requiredPermissions.some((perm) => hasPermission(userPermissions, perm));
// };

// const hasAllPermissions = (userPermissions, requiredPermissions) => {
//     return requiredPermissions.every((perm) => hasPermission(userPermissions, perm));
// };

// const getPermissionsByGroup = (groupName) => {
//     return PERMISSIONS_LIST.filter(p => p.group === groupName);
// };

// const getPermissionGroups = () => {
//     return [...new Set(PERMISSIONS_LIST.map(p => p.group))];
// };

// module.exports = {
//     PERMISSIONS,
//     PERMISSIONS_LIST,
//     VALID_TAGS,
//     hasPermission,
//     hasAnyPermission,
//     hasAllPermissions,
//     getPermissionsByGroup,
//     getPermissionGroups
// };
