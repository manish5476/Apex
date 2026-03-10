/**
 * PERMISSIONS SYSTEM CONFIGURATION
 * This file serves as the single source of truth for all access control tags.
 */

const PERMISSIONS_LIST = [
  // USERS
  { tag: "user:read", group: "System", description: "View Users & Organization Hierarchy" },
  { tag: "user:manage", group: "System", description: "Manage Users, Statuses, and Admin Actions" },
  // STATEMENTS
  { tag: "statement:read", group: "Finance", description: "View Statements (P&L, Balance Sheet, Trial Balance)" },
  
  // STOCK MANAGEMENT
  { tag: "stock:read", group: "Inventory", description: "View stock information, movements, and aging" },
  { tag: "stock:manage", group: "Inventory", description: "Manage stock transfers and reorder levels" },
  { tag: "stock:low_stock", group: "Inventory", description: "View low stock alerts" },
  { tag: "stock:validate", group: "Inventory", description: "Validate Stock Before Sales" },
  { tag: "stock:warnings", group: "Inventory", description: "View Low Stock Warnings" },
  // ASSETS & MEDIA GALLERY
  { tag: "asset:read", group: "Settings", description: "View Media Gallery & Storage Statistics" },
  { tag: "asset:delete", group: "Settings", description: "Permanently Delete Media Assets (High Risk)" },
  // SUPPLIERS
  { tag: "supplier:read", group: "Inventory", description: "View Suppliers & Dashboards" },
  { tag: "supplier:create", group: "Inventory", description: "Create Suppliers (Single/Bulk)" },
  { tag: "supplier:update", group: "Inventory", description: "Edit Suppliers & Manage KYC" },
  { tag: "supplier:delete", group: "Inventory", description: "Delete Suppliers" },
  
  // TRANSACTIONS
  { tag: "transaction:read", group: "Finance", description: "View Transactions" },
  
// SESSIONS
  { tag: "session:view_all", group: "System", description: "View All System Sessions" },
  // Note: The rest use the user:manage tag which we already defined!
  // SEARCH
  { tag: "search:global", group: "Search", description: "Use Global Search" },
  // SALES
  { tag: "sales:manage", group: "Sales", description: "Manage Direct Sales" },
  { tag: "sales:view", group: "Sales", description: "View Sales & Exports" },

  // SALES RETURNS
  { tag: "sales_return:read", group: "Sales", description: "View sales returns" },
  { tag: "sales_return:manage", group: "Sales", description: "Create/process sales returns" },
  // SALES RETURNS
  { tag: "sales_return:read", group: "Sales", description: "View sales returns" },
  { tag: "sales_return:manage", group: "Sales", description: "Create/process sales returns" },
  
  // ROLES
  { tag: "role:manage", group: "System", description: "Manage Roles" },
  // RECONCILIATION
  { tag: "reconciliation:read", group: "Finance", description: "Reconciliation Reporting" },
  { tag: "reconciliation:manage", group: "Finance", description: "Perform reconciliations" },


  // PURCHASE PERMISSIONS
  { tag: "purchase:read", group: "Purchase", description: "View purchase records" },
  { tag: "purchase:create", group: "Purchase", description: "Record new purchases" },
  { tag: "purchase:update", group: "Purchase", description: "Modify purchase records" },
  { tag: "purchase:delete", group: "Purchase", description: "Delete purchases" },
  { tag: "purchase:cancel", group: "Purchase", description: "Cancel entire purchases" },
  { tag: "purchase:return", group: "Purchase", description: "Process partial returns" },
  
  // SPECIFIC ACTIONS
  { tag: "purchase:create_payment", group: "Purchase", description: "Create Purchase Payment" }, 
  { tag: "purchase:payment:view", group: "Purchase", description: "View payment history" },
  { tag: "purchase:payment:delete", group: "Purchase", description: "Delete/void payments" },
  { tag: "purchase:status:update", group: "Purchase", description: "Update purchase status" },
  { tag: "purchase:attachment:upload", group: "Purchase", description: "Upload purchase attachments" },
  { tag: "purchase:attachment:delete", group: "Purchase", description: "Delete purchase attachments" },
  { tag: "purchase:bulk:update", group: "Purchase", description: "Bulk update purchases" },
  { tag: "purchase:analytics:view", group: "Purchase", description: "View purchase analytics" },
  // PRODUCTS
  { tag: "product:read", group: "Inventory", description: "View Products" },
  { tag: "product:create", group: "Inventory", description: "Create Products" },
  { tag: "product:update", group: "Inventory", description: "Edit Products" },
  { tag: "product:delete", group: "Inventory", description: "Delete Products" },
  { tag: "product:stock_adjust", group: "Inventory", description: "Manual Stock Adjustment" },
  
  // STOCK (Used for the transfer route)
  { tag: "stock:manage", group: "Inventory", description: "Manage stock transfers and adjustments" },
  // PAYMENTS
  { tag: "payment:read", group: "Finance", description: "View Payments & Reports" },
  { tag: "payment:create", group: "Finance", description: "Record Payments" },
  { tag: "payment:update", group: "Finance", description: "Update & Allocate payment records" },
  { tag: "payment:delete", group: "Finance", description: "Delete Payments" },

  // TRANSACTIONS
  { tag: "transaction:read", group: "Finance", description: "View Transactions" },
  // ORGANIZATION OWNERSHIP
  { tag: "ownership:transfer", group: "Organization", description: "Transfer organization ownership" },
  // ORGANIZATION MANAGEMENT

  { tag: "org:manage", group: "Organization", description: "Manage Own Organization" },
  { tag: "org:manage_members", group: "Organization", description: "Invite/Remove Members" },
  { tag: "org:manage_platform", group: "Organization", description: "SuperAdmin — Manage Orgs" },
  // ORGANIZATION MANAGEMENT

  { tag: "org:transfer", group: "Organization", description: "Transfer Ownership" },
  { tag: "org:manage_members", group: "Organization", description: "Invite/Remove Members" },
  { tag: "org:manage", group: "Organization", description: "Manage Own Organization" },
  // NOTIFICATIONS
  { tag: "notification:read", group: "Communication", description: "View Notifications" },
  { tag: "notification:manage", group: "Communication", description: "Clear/Delete Notifications" }, // (Admin level creation)

  // FILES
  { tag: "file:upload", group: "Files", description: "Upload files to notes and meetings" },

  // NOTES (Core)
  { tag: "note:read", group: "Notes", description: "View notes, tasks, and journal entries" },
  { tag: "note:write", group: "Notes", description: "Create and update notes" },
  { tag: "note:delete", group: "Notes", description: "Delete notes" },
  
  // NOTES (Advanced Features)
  { tag: "note:view_analytics", group: "Notes", description: "View note analytics and heat maps" },
  { tag: "note:view_calendar", group: "Notes", description: "View calendar with notes and meetings" },
  { tag: "note:export_data", group: "Notes", description: "Export note data" },
  { tag: "note:create_template", group: "Notes", description: "Create note templates" },
  { tag: "note:use_template", group: "Notes", description: "Use existing templates" },
  { tag: "note:bulk_update", group: "Notes", description: "Update multiple notes at once" },
  { tag: "note:bulk_delete", group: "Notes", description: "Delete multiple notes at once" },
  { tag: "note:share", group: "Notes", description: "Share notes with other users" },
  { tag: "note:manage_shared", group: "Notes", description: "Manage access to shared notes" },
  { tag: "note:pin", group: "Notes", description: "Pin important notes" },

  // CROSS-DOMAIN
  { tag: "analytics:read", group: "Analytics", description: "View Analytics Dashboards & Charts" },
  { tag: "meeting:schedule", group: "Meetings", description: "Schedule new meetings" },
  { tag: "meeting:read", group: "Meetings", description: "View meetings and meeting notes" },
  { tag: "meeting:write", group: "Meetings", description: "Create and update meetings" },
  { tag: "meeting:rsvp", group: "Meetings", description: "Accept/decline meeting invitations" },
  { tag: "task:create", group: "Tasks", description: "Create new tasks" },

  // MASTER DATA
  { tag: "master:read", group: "System", description: "View Master Data" },
  { tag: "master:manage", group: "System", description: "Manage Master Data" },

  // MASTER DATA
  { tag: "master:read", group: "System", description: "View Master Data lists and filters" },
  { tag: "master:manage", group: "System", description: "Export and manage Master Data" },

  // SYSTEM LOGS
  { tag: "logs:view", group: "System", description: "Read server-side system and error logs" },

  // LEDGER PERMISSIONS
  { tag: "ledger:read", group: "Finance", description: "View General Ledger and Financial Statements" },
  { tag: "ledger:delete", group: "Finance", description: "Delete/Void Ledger Entries" },

  // INVOICES
  { tag: "invoice:read", group: "Billing", description: "View invoices and analytics" },
  { tag: "invoice:create", group: "Billing", description: "Create new invoices" },
  { tag: "invoice:update", group: "Billing", description: "Edit/Cancel invoices" },
  { tag: "invoice:delete", group: "Billing", description: "Delete/Trash invoices" },
  { tag: "invoice:download", group: "Billing", description: "Download/Email PDFs" },
  { tag: "invoice:export", group: "Billing", description: "Export invoice data" },

  // REPORTS (Granular)
  { tag: "report:profit", group: "Reports", description: "View profit reports" },
  { tag: "report:sales", group: "Reports", description: "View sales reports" },
  { tag: "report:tax", group: "Reports", description: "View tax reports" },
  { tag: "report:outstanding", group: "Reports", description: "View outstanding invoice reports" },

  // INVOICE OUTPUTS
  { tag: "invoice:download", group: "Billing", description: "Download PDF or Email Invoices to Customers" },
// INVENTORY MOVEMENTS
  { tag: "product:stock_adjust", group: "Inventory", description: "Manual Stock Adjustment (Correcting Errors)" },
  { tag: "stock:manage", group: "Inventory", description: "Manage stock transfers between locations" },

// ACTIVITY FEEDS
  { tag: "feed:read", group: "Communication", description: "View customer activity timelines and feeds" },

  // EMI & INSTALLMENTS
  { tag: "emi:read", group: "Finance", description: "View EMI plans and schedules" },
  { tag: "emi:create", group: "Finance", description: "Create new EMI/Loan plans" },
  { tag: "emi:pay", group: "Finance", description: "Process installment payments" },
  { tag: "emi:manage", group: "Finance", description: "Delete plans and mark overdue" },
  // DASHBOARD
  { tag: "dashboard:view", group: "General", description: "Access the main overview dashboard and KPIs" },
  // CUSTOMERS
  { tag: "customer:read", group: "CRM", description: "View customer profiles and history" },
  { tag: "customer:create", group: "CRM", description: "Register new customers" },
  { tag: "customer:update", group: "CRM", description: "Edit customer details" },
  { tag: "customer:delete", group: "CRM", description: "Archive/Delete customers" },
  { tag: "customer:credit_limit", group: "CRM", description: "Modify customer credit terms and limits" },

// ANALYTICS
  { tag: "analytics:read", group: "Analytics", description: "View general customer and financial dashboards" },
  { tag: "analytics:emi_read", group: "Analytics", description: "View sensitive EMI and debt-related analytics" },
  { tag: "analytics:export", group: "Analytics", description: "Export raw analytical data to CSV/Excel" },

// SYSTEM OPERATIONS
  { tag: "system:manage", group: "System", description: "Manage background jobs, cache, and system status" },

// CHAT & COLLABORATION
  { tag: "chat:read", group: "Communication", description: "View channels and read messages" },
  { tag: "chat:send", group: "Communication", description: "Send messages and upload attachments" },
  { tag: "chat:delete", group: "Communication", description: "Delete own messages" },
  { tag: "chat:manage_channel", group: "Communication", description: "Create/Disable channels and manage members" },
  // CHART ANALYTICS
  { tag: "analytics:read", group: "Analytics", description: "View dashboard charts and visual performance trends" },

// BRANCH MANAGEMENT
  { tag: "branch:read", group: "Organization", description: "View branch lists and details" },
  { tag: "branch:manage", group: "Organization", description: "Create, Update, and Delete branches" },

  // AUTOMATION & INTEGRATION
  { tag: "automation:read", group: "System", description: "View configured workflows and webhooks" },
  { tag: "automation:webhook", group: "System", description: "Manage incoming and outgoing webhooks" },
  { tag: "automation:workflow", group: "System", description: "Create and edit internal automation workflows" },

// USER SECURITY
  { tag: "auth:manage_sessions", group: "Security", description: "View and terminate active login sessions" },

  // ANNOUNCEMENTS
  { tag: "announcement:read", group: "Communication", description: "View and interact with announcements" },
  { tag: "announcement:manage", group: "Communication", description: "Create, Edit, and Delete announcements" },

// AI & AUTOMATION
  { tag: "ai:chat", group: "System", description: "Interact with the AI assistant for data queries and automation" },

// ADMINISTRATIVE ANALYTICS
  { tag: "analytics:view_executive", group: "Analytics", description: "View top-level company KPIs and branch performance" },
  { tag: "analytics:view_financial", group: "Analytics", description: "View monthly trends and outstanding debt reports" },


// CHART OF ACCOUNTS
  { tag: "account:read", group: "Finance", description: "View the Chart of Accounts list" },
  { tag: "account:manage", group: "Finance", description: "Create, Edit, Delete, and Restructure Accounts" },
  // ANALYTICS & BUSINESS INTELLIGENCE
  { tag: "analytics:view_executive", group: "Analytics", description: "Full access to executive dashboards and system health" },
  { tag: "analytics:view_financial", group: "Analytics", description: "Access to revenue, cash flow, and EMI analytics" },
  { tag: "analytics:view_branch_comparison", group: "Analytics", description: "Compare performance metrics across different branches" },
  { tag: "analytics:view_customer_segmentation", group: "Analytics", description: "View RFM segmentation and customer intelligence" },
  { tag: "analytics:view_customer_ltv", group: "Analytics", description: "View customer lifetime value and tier analysis" },
  { tag: "analytics:view_churn", group: "Analytics", description: "Access churn risk and inactivity reports" },
  { tag: "analytics:view_inventory", group: "Analytics", description: "Full inventory health and valuation dashboards" },
  { tag: "analytics:view_stock_forecast", group: "Analytics", description: "View stock-out and reorder predictions" },
  { tag: "analytics:view_operational", group: "Analytics", description: "Access efficiency, peak hours, and time-based metrics" },
  { tag: "analytics:view_staff_performance", group: "Analytics", description: "Monitor individual staff sales and productivity" },
  { tag: "analytics:view_forecast", group: "Analytics", description: "Access predictive sales and revenue models" },
  { tag: "analytics:view_alerts", group: "Analytics", description: "Monitor real-time business and system alerts" },
  { tag: "analytics:view_security_audit", group: "Analytics", description: "Access security logs and compliance dashboards" },
  { tag: "analytics:export_data", group: "Analytics", description: "Permission to export raw analytics data to CSV/External tools" },
// ATTENDANCE & HR
  { tag: "attendance:read", group: "HR", description: "View personal and team attendance records" },
  { tag: "attendance:manage", group: "HR", description: "Edit, recalculate, and export company-wide attendance" },
  { tag: "attendance:regularize", group: "HR", description: "Approve or apply for attendance corrections" },

// ATTENDANCE LOGS
  { tag: "attendance:log_read", group: "HR", description: "View raw clock-in/out logs and realtime feeds" },
  { tag: "attendance:log_manage", group: "HR", description: "Verify, flag, or correct raw biometric logs" },

// ATTENDANCE HARDWARE
  { tag: "attendance:machine_read", group: "HR", description: "View biometric machine status and logs" },
  { tag: "attendance:machine_manage", group: "HR", description: "Register machines, map users, and regenerate API keys" },
// GEOFENCING & LOCATION
  { tag: "attendance:geofence_read", group: "HR", description: "View geofence zones, statistics, and location violations" },
  { tag: "attendance:geofence_manage", group: "HR", description: "Create, update, delete geofences and assign them to users/departments" },
  // HOLIDAYS & CALENDAR
  { tag: "holiday:read", group: "HR", description: "View the holiday calendar and upcoming company holidays" },
  { tag: "holiday:manage", group: "HR", description: "Create, edit, and bulk-import holidays or copy calendar from previous years" },

  // DEPARTMENT MANAGEMENT
  { tag: "department:read", group: "Organization", description: "View department lists, hierarchy, and basic stats" },
  { tag: "department:manage", group: "Organization", description: "Create, edit, delete, and bulk-update departments" },

// DESIGNATION & CAREER
  { tag: "designation:read", group: "Organization", description: "View job titles, hierarchy, and career paths" },
  { tag: "designation:manage", group: "Organization", description: "Create job titles, set salary bands, and define promotion criteria" },
  // SHIFT & ROSTERING
  { tag: "shift:read", group: "HR", description: "View shift definitions, timelines, and coverage reports" },
  { tag: "shift:manage", group: "HR", description: "Create, edit, and clone shift templates and duty rotations" },

  // SHIFT GROUPS & ROTATIONS
  { tag: "shift:group_read", group: "HR", description: "View shift group definitions and member assignments" },
  { tag: "shift:group_manage", group: "HR", description: "Create shift groups, assign users, and generate rotation schedules" },

  // LEAVE BALANCES
  { tag: "leave:balance_read", group: "HR", description: "View personal or company-wide leave balances and reports" },
  { tag: "leave:balance_manage", group: "HR", description: "Initialize, manually update, or trigger monthly leave accruals" },
// LEAVE REQUESTS
  { tag: "leave:read", group: "HR", description: "View personal and team leave history" },
  { tag: "leave:request", group: "HR", description: "Apply for and manage personal leave requests" },
  { tag: "leave:approve", group: "HR", description: "Approve, reject, or escalate leave requests for direct reports or company-wide" },
  { tag: "leave:admin", group: "HR", description: "Access leave analytics and bulk approval tools" },
];

/**
 * LOGIC GENERATION
 */

// 1. Generate set of all valid tags (including wildcards)
const VALID_TAGS = PERMISSIONS_LIST.map((p) => p.tag);
VALID_TAGS.push("*");

const categorySet = new Set();
PERMISSIONS_LIST.forEach((p) => {
    const [category] = p.tag.split(":");
    categorySet.add(category);
});

categorySet.forEach((category) => {
    VALID_TAGS.push(`${category}:*`);
});

// 2. Build the PERMISSIONS object constant (e.g. PERMISSIONS.USER.READ)
const PERMISSIONS = {};
PERMISSIONS_LIST.forEach((p) => {
    const parts = p.tag.split(":");
    const resource = parts[0].toUpperCase().replace(/-/g, "_");
    const action = parts.slice(1).join("_").toUpperCase().replace(/-/g, "_");

    if (!PERMISSIONS[resource]) PERMISSIONS[resource] = {};
    PERMISSIONS[resource][action] = p.tag;
});

/**
 * HELPER FUNCTIONS
 */

const hasPermission = (userPermissions, requiredPermission) => {
    if (!userPermissions || !userPermissions.length) return false;
    if (userPermissions.includes("*")) return true;
    if (userPermissions.includes(requiredPermission)) return true;

    const [category] = requiredPermission.split(":");
    if (userPermissions.includes(`${category}:*`)) return true;

    return false;
};

const hasAnyPermission = (userPermissions, requiredPermissions) => {
    return requiredPermissions.some((perm) => hasPermission(userPermissions, perm));
};

const hasAllPermissions = (userPermissions, requiredPermissions) => {
    return requiredPermissions.every((perm) => hasPermission(userPermissions, perm));
};

const getPermissionsByGroup = (groupName) => {
    return PERMISSIONS_LIST.filter(p => p.group === groupName);
};

const getPermissionGroups = () => {
    return [...new Set(PERMISSIONS_LIST.map(p => p.group))];
};

module.exports = {
    PERMISSIONS,
    PERMISSIONS_LIST,
    VALID_TAGS,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getPermissionsByGroup,
    getPermissionGroups
};
