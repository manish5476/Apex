/**
 * PERMISSIONS — single source of truth
 * Define once here; everything else is auto-generated.
 */

const p = (tag, group, description) => ({ tag, group, description });

const PERMISSIONS_LIST = [
  // ── System ────────────────────────────────────────────────────────
  p("user:read", "System", "View Users & Organization Hierarchy"),
  p("user:manage", "System", "Manage Users, Statuses, and Admin Actions"),
  p("role:manage", "System", "Manage Roles"),
  p("session:view_all", "System", "View All System Sessions"),
  p("master:read", "System", "View Master Data lists and filters"),
  p("master:manage", "System", "Export and manage Master Data"),
  p("logs:view", "System", "Read server-side system and error logs"),
  p("system:manage", "System", "Manage background jobs, cache, and system status"),
  p("automation:read", "System", "View configured workflows and webhooks"),
  p("automation:webhook", "System", "Manage incoming and outgoing webhooks"),
  p("automation:workflow", "System", "Create and edit internal automation workflows"),
  p("ai:chat", "System", "Interact with the AI assistant for data queries"),

  // ── Security & Settings ───────────────────────────────────────────
  p("auth:manage_sessions", "Security", "View and terminate active login sessions"),
  p("asset:read", "Settings", "View Media Gallery & Storage Statistics"),
  p("asset:delete", "Settings", "Permanently Delete Media Assets (High Risk)"),

  // ── Organization ──────────────────────────────────────────────────
  p("org:manage", "Organization", "Manage Own Organization"),
  p("org:manage_members", "Organization", "Invite/Remove Members"),
  p("org:manage_platform", "Organization", "SuperAdmin — Manage Orgs"),
  p("org:transfer", "Organization", "Transfer Ownership"),
  p("ownership:transfer", "Organization", "Transfer organization ownership"),
  p("branch:read", "Organization", "View branch lists and details"),
  p("branch:manage", "Organization", "Create, Update, and Delete branches"),
  p("department:read", "Organization", "View department lists, hierarchy, and basic stats"),
  p("department:manage", "Organization", "Create, edit, delete, and bulk-update departments"),
  p("designation:read", "Organization", "View job titles, hierarchy, and career paths"),
  p("designation:manage", "Organization", "Create job titles, set salary bands, and promotion criteria"),

  // ── HR & Attendance ───────────────────────────────────────────────
  p("attendance:read", "HR", "View personal and team attendance records"),
  p("attendance:manage", "HR", "Edit, recalculate, and export company-wide attendance"),
  p("attendance:regularize", "HR", "Approve or apply for attendance corrections"),
  p("attendance:log_read", "HR", "View raw clock-in/out logs and realtime feeds"),
  p("attendance:log_manage", "HR", "Verify, flag, or correct raw biometric logs"),
  p("attendance:machine_read", "HR", "View biometric machine status and logs"),
  p("attendance:machine_manage", "HR", "Register machines, map users, and regenerate API keys"),
  p("attendance:geofence_read", "HR", "View geofence zones, statistics, and location violations"),
  p("attendance:geofence_manage", "HR", "Create, update, delete geofences and assign them"),
  p("holiday:read", "HR", "View the holiday calendar and upcoming company holidays"),
  p("holiday:manage", "HR", "Create, edit, and bulk-import holidays"),
  p("shift:read", "HR", "View shift definitions, timelines, and coverage reports"),
  p("shift:manage", "HR", "Create, edit, and clone shift templates and duty rotations"),
  p("shift:group_read", "HR", "View shift group definitions and member assignments"),
  p("shift:group_manage", "HR", "Create shift groups, assign users, and generate rotation schedules"),
  p("leave:balance_read", "HR", "View personal or company-wide leave balances and reports"),
  p("leave:balance_manage", "HR", "Initialize, manually update, or trigger monthly leave accruals"),
  p("leave:read", "HR", "View personal and team leave history"),
  p("leave:request", "HR", "Apply for and manage personal leave requests"),
  p("leave:approve", "HR", "Approve, reject, or escalate leave requests"),
  p("leave:admin", "HR", "Access leave analytics and bulk approval tools"),

  // ── Finance & Billing ─────────────────────────────────────────────
  p("account:read", "Finance", "View the Chart of Accounts list"),
  p("account:manage", "Finance", "Create, Edit, Delete, and Restructure Accounts"),
  p("statement:read", "Finance", "View Statements (P&L, Balance Sheet, Trial Balance)"),
  p("transaction:read", "Finance", "View Transactions"),
  p("ledger:read", "Finance", "View General Ledger and Financial Statements"),
  p("ledger:delete", "Finance", "Delete/Void Ledger Entries"),
  p("payment:read", "Finance", "View Payments & Reports"),
  p("payment:create", "Finance", "Record Payments"),
  p("payment:update", "Finance", "Update & Allocate payment records"),
  p("payment:delete", "Finance", "Delete Payments"),
  p("emi:read", "Finance", "View EMI plans and schedules"),
  p("emi:create", "Finance", "Create new EMI/Loan plans"),
  p("emi:manage", "Finance", "Delete plans and mark overdue"),
  p("emi:pay", "Finance", "Process installment payments"),
  p("invoice:read", "Billing", "View invoices and analytics"),
  p("invoice:create", "Billing", "Create new invoices"),
  p("invoice:update", "Billing", "Edit/Cancel invoices"),
  p("invoice:delete", "Billing", "Delete/Trash invoices"),
  p("invoice:download", "Billing", "Download PDF or Email Invoices to Customers"),
  p("invoice:export", "Billing", "Export invoice data"),

  // ── Inventory & Products ──────────────────────────────────────────
  p("stock:read", "Inventory", "View stock information, movements, and aging"),
  p("stock:manage", "Inventory", "Manage stock transfers and adjustments"),
  p("stock:low_stock", "Inventory", "View low stock alerts"),
  p("supplier:read", "Inventory", "View Suppliers & Dashboards"),
  p("supplier:create", "Inventory", "Create Suppliers (Single/Bulk)"),
  p("supplier:update", "Inventory", "Edit Suppliers & Manage KYC"),
  p("supplier:delete", "Inventory", "Delete Suppliers"),
  p("product:read", "Inventory", "View Products"),
  p("product:create", "Inventory", "Create Products"),
  p("product:update", "Inventory", "Edit Products"),
  p("product:delete", "Inventory", "Delete Products"),
  p("product:stock_adjust", "Inventory", "Manual Stock Adjustment (Correcting Errors)"),

  // ── Sales & Purchase ──────────────────────────────────────────────
  p("sales:manage", "Sales", "Manage Direct Sales"),
  p("sales:view", "Sales", "View Sales & Exports"),
  p("sales_return:read", "Sales", "View sales returns"),
  p("sales_return:manage", "Sales", "Create/process sales returns"),
  p("purchase:read", "Purchase", "View purchase records"),
  p("purchase:create", "Purchase", "Record new purchases"),
  p("purchase:update", "Purchase", "Modify purchase records"),
  p("purchase:delete", "Purchase", "Delete purchases"),
  p("purchase:cancel", "Purchase", "Cancel entire purchases"),
  p("purchase:return", "Purchase", "Process partial returns"),
  p("purchase:create_payment", "Purchase", "Create Purchase Payment"),
  p("purchase:payment_view", "Purchase", "View payment history"),
  p("purchase:payment_delete", "Purchase", "Delete/void payments"),
  p("purchase:status_update", "Purchase", "Update purchase status"),
  p("purchase:attachment_upload", "Purchase", "Upload purchase attachments"),
  p("purchase:attachment_delete", "Purchase", "Delete purchase attachments"),
  p("purchase:bulk_update", "Purchase", "Bulk update purchases"),
  p("purchase:analytics_view", "Purchase", "View purchase analytics"),

  // ── CRM & Analytics ───────────────────────────────────────────────
  p("customer:read", "CRM", "View customer profiles and history"),
  p("customer:create", "CRM", "Register new customers"),
  p("customer:update", "CRM", "Edit customer details"),
  p("customer:delete", "CRM", "Archive/Delete customers"),
  p("customer:credit_limit", "CRM", "Modify customer credit terms and limits"),
  p("analytics:read", "Analytics", "View Analytics Dashboards & visual trends"),
  p("analytics:emi_read", "Analytics", "View sensitive EMI and debt analytics"),
  p("analytics:export", "Analytics", "Export raw analytical data"),
  p("analytics:export_data", "Analytics", "Permission to export raw analytics to external tools"),
  p("analytics:view_executive", "Analytics", "Executive dashboards and system health"),
  p("analytics:view_financial", "Analytics", "Revenue, cash flow, and EMI analytics"),
  p("analytics:view_cashflow", "Analytics", "Detailed cash flow analysis"),
  p("analytics:view_branch_comparison", "Analytics", "Compare metrics across branches"),
  p("analytics:view_customer_segmentation", "Analytics", "RFM and customer intelligence"),
  p("analytics:view_customer_ltv", "Analytics", "Customer lifetime value analysis"),
  p("analytics:view_customer_insights", "Analytics", "Deep customer behavior insights"),
  p("analytics:view_churn", "Analytics", "Churn risk and inactivity reports"),
  p("analytics:view_inventory", "Analytics", "Inventory health and valuation"),
  p("analytics:view_stock_forecast", "Analytics", "Stock-out and reorder predictions"),
  p("analytics:view_dead_stock", "Analytics", "Identify non-moving inventory"),
  p("analytics:view_operational", "Analytics", "Efficiency and time-based metrics"),
  p("analytics:view_peak_hours", "Analytics", "Identify high-traffic business hours"),
  p("analytics:view_staff_performance", "Analytics", "Monitor staff productivity"),
  p("analytics:view_forecast", "Analytics", "Predictive sales models"),
  p("analytics:view_alerts", "Analytics", "Real-time business alerts"),
  p("analytics:view_security_audit", "Analytics", "Security logs and compliance"),
  p("analytics:view_market_basket", "Analytics", "Product affinity and bundle analysis"),
  p("analytics:view_procurement", "Analytics", "Supplier and buying trends"),
  p("analytics:view_product_performance", "Analytics", "Individual product ROI and sales"),
  p("analytics:view_payment_behavior", "Analytics", "Customer payment timing and modes"),
  p("dashboard:view", "General", "Access main overview dashboard"),

  p("reconciliation:manage", "Accounting", "Manage reconciliation"),
  // ── Reports ───────────────────────────────────────────────────────
  p("report:profit", "Reports", "View profit reports"),
  p("report:sales", "Reports", "View sales reports"),
  p("report:tax", "Reports", "View tax reports"),
  p("report:outstanding", "Reports", "View outstanding invoice reports"),

  // ── Communication & Collaboration ─────────────────────────────────
  p("notification:read", "Communication", "View Notifications"),
  p("notification:manage", "Communication", "Clear/Delete Notifications"),
  p("feed:read", "Communication", "View activity timelines"),
  p("chat:read", "Communication", "View channels and messages"),
  p("chat:send", "Communication", "Send messages and attachments"),
  p("chat:delete", "Communication", "Delete own messages"),
  p("chat:manage_channel", "Communication", "Manage channels and members"),
  p("announcement:read", "Communication", "View announcements"),
  p("announcement:manage", "Communication", "Manage announcements"),
  p("meeting:schedule", "Meetings", "Schedule new meetings"),
  p("meeting:read", "Meetings", "View meetings and notes"),
  p("meeting:write", "Meetings", "Create/update meetings"),
  p("meeting:rsvp", "Meetings", "Accept/decline invitations"),

  // ── Files & Notes ─────────────────────────────────────────────────
  p("file:upload", "Files", "Upload files to notes and meetings"),
  p("note:read", "Notes", "View notes and tasks"),
  p("note:write", "Notes", "Create and update notes"),
  p("note:delete", "Notes", "Delete notes"),
  p("note:view_analytics", "Notes", "Note analytics and heat maps"),
  p("note:view_calendar", "Notes", "View calendar with notes"),
  p("note:export_data", "Notes", "Export note data"),
  p("note:create_template", "Notes", "Create note templates"),
  p("note:use_template", "Notes", "Use existing templates"),
  p("note:bulk_update", "Notes", "Update multiple notes"),
  p("note:bulk_delete", "Notes", "Delete multiple notes"),
  p("note:share", "Notes", "Share notes"),
  p("note:manage_shared", "Notes", "Manage shared access"),
  p("note:pin", "Notes", "Pin important notes"),
  p("task:create", "Tasks", "Create tasks"),
  // ── Global Search ─────────────────────────────────────────────────
  p("search:global", "Search", "Use Global Search"),
];


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

/**
 * Merge role permissions + per-user overrides → effective permission set.
 * Single source of truth used by auth controllers, middlewares, and HRMS logic.
 */
const mergePermissions = (rolePermissions = [], overrides = {}) => {
  const base = new Set(rolePermissions);
  (overrides?.granted ?? []).forEach(p => base.add(p));
  (overrides?.revoked ?? []).forEach(p => base.delete(p));
  return [...base];
};

// ── Helper functions ───────────────────────────────────────────────

const hasPermission = (userPerms, required) => {
  if (!userPerms?.length) return false;
  if (userPerms.includes("*")) return true;  // owner wildcard
  if (userPerms.includes(required)) return true;  // exact match
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
  mergePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getPermissionsByGroup,
  getPermissionGroups,
};

