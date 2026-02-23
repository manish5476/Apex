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

// const PERMISSIONS_LIST = [
//     // -----------------------------------------------------------
//     // ANALYTICS — EXECUTIVE & STRATEGIC
//     // -----------------------------------------------------------
//     { tag: "analytics:view_executive", group: "Analytics", description: "Access Executive Dashboards & KPIs" },
//     { tag: "analytics:view_branch_comparison", group: "Analytics", description: "Compare Branch-Level Performance" },
//     { tag: "analytics:view_forecast", group: "Analytics", description: "Access Forecasting & Predictive Analysis" },
//     { tag: "analytics:view_alerts", group: "Analytics", description: "View Critical Stock & Business Alerts" },
//     { tag: "analytics:read", group: "Analytics", description: "General Analytics Access" },

//     // FINANCIAL INSIGHT MODULES
//     { tag: "analytics:view_financial", group: "Analytics", description: "View Financial Metrics & P&L" },
//     { tag: "analytics:view_cashflow", group: "Analytics", description: "View Cash Flow" },
//     { tag: "analytics:view_tax", group: "Analytics", description: "View GST/Tax Reports" },
//     { tag: "analytics:view_debtor_aging", group: "Analytics", description: "Debtor Ageing Analysis" },
//     { tag: "analytics:view_profitability", group: "Analytics", description: "Product/Invoice Profitability" },

//     // OPERATIONAL
//     { tag: "analytics:view_operational", group: "Analytics", description: "Operational KPIs" },
//     { tag: "analytics:view_staff_performance", group: "Analytics", description: "Employee Performance Metrics" },
//     { tag: "analytics:view_peak_hours", group: "Analytics", description: "Peak Business Windows" },
//     { tag: "analytics:view_procurement", group: "Analytics", description: "Procurement & Supplier Spend" },
//     { tag: "analytics:view_customer_insights", group: "Analytics", description: "General Customer Risk & Insights" },

//     // INVENTORY INTELLIGENCE
//     { tag: "analytics:view_inventory", group: "Analytics", description: "Inventory Valuation" },
//     { tag: "analytics:view_product_performance", group: "Analytics", description: "Product Performance" },
//     { tag: "analytics:view_dead_stock", group: "Analytics", description: "Dead Stock Reporting" },
//     { tag: "analytics:view_stock_forecast", group: "Analytics", description: "Stock-Out Forecasting" },

//     // PREDICTIVE / ADVANCED
//     { tag: "analytics:view_customer_segmentation", group: "Analytics", description: "RFM Segmentation Analysis" },
//     { tag: "analytics:view_customer_retention", group: "Analytics", description: "Cohort & Retention Analysis" },

//     // CUSTOMER INTELLIGENCE
//     { tag: "analytics:view_customer_ltv", group: "Analytics", description: "Customer Lifetime Value" },
//     { tag: "analytics:view_churn", group: "Analytics", description: "Churn Risk Reporting" },
//     { tag: "analytics:view_market_basket", group: "Analytics", description: "Market Basket Analysis" },
//     { tag: "analytics:view_payment_behavior", group: "Analytics", description: "Payment Pattern Metrics" },

//     // SECURITY & EXPORT
//     { tag: "analytics:view_security_audit", group: "Analytics", description: "Audit Log Access" },
//     { tag: "analytics:export_data", group: "Analytics", description: "Export Analytics Reports" },
//     { tag: "analytics:chart_view", group: "Analytics", description: "View chart visualizations" },
//     { tag: "analytics:export_charts", group: "Analytics", description: "Export chart data" },

//     // -----------------------------------------------------------
//     // DASHBOARD
//     // -----------------------------------------------------------
//     { tag: "dashboard:view", group: "Dashboard", description: "View dashboard overview" },

//     // -----------------------------------------------------------
//     // NOTE & PLANNER SYSTEM
//     // -----------------------------------------------------------
//     { tag: "note:read", group: "Notes", description: "View notes, tasks, and journal entries" },
//     { tag: "note:write", group: "Notes", description: "Create and update notes" },
//     { tag: "note:delete", group: "Notes", description: "Delete notes" },
//     { tag: "note:share", group: "Notes", description: "Share notes with other users" },
//     { tag: "note:manage_shared", group: "Notes", description: "Manage access to shared notes" },
//     { tag: "note:create_template", group: "Notes", description: "Create note templates" },
//     { tag: "note:use_template", group: "Notes", description: "Use existing templates" },
//     { tag: "note:manage_templates", group: "Notes", description: "Manage organization templates" },
//     { tag: "note:view_analytics", group: "Notes", description: "View note analytics and heat maps" },
//     { tag: "note:export_data", group: "Notes", description: "Export note data" },
//     { tag: "note:bulk_update", group: "Notes", description: "Update multiple notes at once" },
//     { tag: "note:bulk_delete", group: "Notes", description: "Delete multiple notes at once" },
//     { tag: "note:view_calendar", group: "Notes", description: "View calendar with notes and meetings" },
//     { tag: "note:manage_calendar", group: "Notes", description: "Manage calendar events" },
//     { tag: "note:convert_task", group: "Notes", description: "Convert notes to tasks" },
//     { tag: "note:pin", group: "Notes", description: "Pin important notes" },

//     // -----------------------------------------------------------
//     // MEETING MANAGEMENT
//     // -----------------------------------------------------------
//     { tag: "meeting:read", group: "Meetings", description: "View meetings and meeting notes" },
//     { tag: "meeting:write", group: "Meetings", description: "Create and update meetings" },
//     { tag: "meeting:delete", group: "Meetings", description: "Delete meetings" },
//     { tag: "meeting:schedule", group: "Meetings", description: "Schedule new meetings" },
//     { tag: "meeting:reschedule", group: "Meetings", description: "Reschedule existing meetings" },
//     { tag: "meeting:cancel", group: "Meetings", description: "Cancel meetings" },
//     { tag: "meeting:invite", group: "Meetings", description: "Invite participants to meetings" },
//     { tag: "meeting:rsvp", group: "Meetings", description: "Accept/decline meeting invitations" },
//     { tag: "meeting:manage_participants", group: "Meetings", description: "Manage meeting participants" },
//     { tag: "meeting:start", group: "Meetings", description: "Start meetings" },
//     { tag: "meeting:end", group: "Meetings", description: "End meetings" },
//     { tag: "meeting:record", group: "Meetings", description: "Record meetings" },
//     { tag: "meeting:upload_materials", group: "Meetings", description: "Upload meeting materials" },
//     { tag: "meeting:manage_materials", group: "Meetings", description: "Manage meeting materials" },
//     { tag: "meeting:view_attendance", group: "Meetings", description: "View meeting attendance reports" },
//     { tag: "meeting:export_minutes", group: "Meetings", description: "Export meeting minutes" },
//     { tag: "meeting:set_reminder", group: "Meetings", description: "Set meeting reminders" },
//     { tag: "meeting:recurring", group: "Meetings", description: "Create recurring meetings" },

//     // -----------------------------------------------------------
//     // TASK MANAGEMENT
//     // -----------------------------------------------------------
//     { tag: "task:read", group: "Tasks", description: "View tasks" },
//     { tag: "task:write", group: "Tasks", description: "Create and update tasks" },
//     { tag: "task:delete", group: "Tasks", description: "Delete tasks" },
//     { tag: "task:assign", group: "Tasks", description: "Assign tasks to users" },
//     { tag: "task:complete", group: "Tasks", description: "Mark tasks as complete" },
//     { tag: "task:reopen", group: "Tasks", description: "Reopen completed tasks" },
//     { tag: "task:set_priority", group: "Tasks", description: "Set task priority" },
//     { tag: "task:set_deadline", group: "Tasks", description: "Set task deadlines" },
//     { tag: "task:set_reminder", group: "Tasks", description: "Set task reminders" },
//     { tag: "task:add_subtask", group: "Tasks", description: "Add subtasks" },
//     { tag: "task:track_time", group: "Tasks", description: "Track time on tasks" },
//     { tag: "task:create", group: "Tasks", description: "Create new tasks" },

//     // -----------------------------------------------------------
//     // PROJECT MANAGEMENT
//     // -----------------------------------------------------------
//     { tag: "project:read", group: "Projects", description: "View projects" },
//     { tag: "project:write", group: "Projects", description: "Update projects" },
//     { tag: "project:delete", group: "Projects", description: "Delete projects" },
//     { tag: "project:create", group: "Projects", description: "Create new projects" },
//     { tag: "project:manage", group: "Projects", description: "Manage projects and team members" },
//     { tag: "project:view_analytics", group: "Projects", description: "View project analytics" },
//     { tag: "project:manage_milestones", group: "Projects", description: "Manage project milestones" },
//     { tag: "project:manage_budget", group: "Projects", description: "Manage project budget" },

//     // -----------------------------------------------------------
//     // CALENDAR
//     // -----------------------------------------------------------
//     { tag: "calendar:view", group: "Calendar", description: "View calendar" },
//     { tag: "calendar:edit", group: "Calendar", description: "Edit calendar events" },
//     { tag: "calendar:manage", group: "Calendar", description: "Manage calendar settings" },
//     { tag: "calendar:share", group: "Calendar", description: "Share calendar" },
//     { tag: "calendar:sync", group: "Calendar", description: "Sync with external calendars" },

//     // -----------------------------------------------------------
//     // CUSTOMER MANAGEMENT
//     // -----------------------------------------------------------
//     { tag: "customer:read", group: "Customers", description: "View Customer Data" },
//     { tag: "customer:create", group: "Customers", description: "Create Customer Records" },
//     { tag: "customer:update", group: "Customers", description: "Edit Customer Records" },
//     { tag: "customer:delete", group: "Customers", description: "Delete Customers" },
//     { tag: "customer:credit_limit", group: "Customers", description: "Modify Credit Limits" },

//     { tag: "analytics:read", group: "Analytics", description: "View Analytics Dashboards & Charts" },
//     { tag: "analytics:export", group: "Analytics", description: "Export Analytics Reports (CSV/Excel)" },
//     { tag: "analytics:emi_read", group: "Analytics", description: "View Sensitive EMI & Loan Data" },


//     // FEED (Customer Activity)
//     { tag: "feed:read", group: "Customers", description: "View customer activity feed" },

//     // -----------------------------------------------------------
//     // INVENTORY MANAGEMENT
//     // -----------------------------------------------------------
//     // PRODUCTS
//     { tag: "product:read", group: "Inventory", description: "View Products" },
//     { tag: "product:create", group: "Inventory", description: "Create Products" },
//     { tag: "product:update", group: "Inventory", description: "Edit Products" },
//     { tag: "product:delete", group: "Inventory", description: "Delete Products" },
//     { tag: "product:stock_adjust", group: "Inventory", description: "Manual Stock Adjustment" },

//     // ======================================================
//     // PURCHASE PERMISSIONS
//     // ======================================================
//     // --- Basic CRUD Operations ---
//     { tag: "purchase:read", group: "Purchase", description: "View purchase records" },
//     { tag: "purchase:create", group: "Purchase", description: "Record new purchases" },
//     { tag: "purchase:update", group: "Purchase", description: "Modify purchase records" },
//     { tag: "purchase:delete", group: "Purchase", description: "Delete purchases" },

//     // --- Financial Operations ---
//     { tag: "purchase:payment:record", group: "Purchase", description: "Record payments against purchases" },
//     { tag: "purchase:create_payment", group: "Purchase", description: "Create Purchase Payment" }, 
//     { tag: "purchase:payment:view", group: "Purchase", description: "View payment history" },
//     { tag: "purchase:payment:delete", group: "Purchase", description: "Delete/void payments" },
//     { tag: "purchase:payment:bulk", group: "Purchase", description: "Process bulk payments" },

//     // --- Return & Cancellation ---
//     { tag: "purchase:cancel", group: "Purchase", description: "Cancel entire purchases" },
//     { tag: "purchase:return", group: "Purchase", description: "Process partial returns" },
//     { tag: "purchase:approve_return", group: "Purchase", description: "Approve purchase returns" },

//     // --- Status Management ---
//     { tag: "purchase:status:update", group: "Purchase", description: "Update purchase status" },
//     { tag: "purchase:approve", group: "Purchase", description: "Approve purchase orders" },
//     { tag: "purchase:reject", group: "Purchase", description: "Reject purchase orders" },
//     { tag: "purchase:verify", group: "Purchase", description: "Verify received goods" },

//     // --- Document Management ---
//     { tag: "purchase:attachment:upload", group: "Purchase", description: "Upload purchase attachments" },
//     { tag: "purchase:attachment:delete", group: "Purchase", description: "Delete purchase attachments" },
//     { tag: "purchase:attachment:view", group: "Purchase", description: "View purchase attachments" },

//     // --- Bulk Operations ---
//     { tag: "purchase:bulk:create", group: "Purchase", description: "Bulk import purchases" },
//     { tag: "purchase:bulk:update", group: "Purchase", description: "Bulk update purchases" },
//     { tag: "purchase:bulk:delete", group: "Purchase", description: "Bulk delete purchases" },

//     // --- Reports & Analytics ---
//     { tag: "purchase:report:view", group: "Purchase", description: "View purchase reports" },
//     { tag: "purchase:report:generate", group: "Purchase", description: "Generate purchase reports" },
//     { tag: "purchase:analytics:view", group: "Purchase", description: "View purchase analytics" },
//     { tag: "purchase:dashboard:view", group: "Purchase", description: "View purchase dashboard" },

//     // --- Export Operations ---
//     { tag: "purchase:export:csv", group: "Purchase", description: "Export purchases to CSV" },
//     { tag: "purchase:export:pdf", group: "Purchase", description: "Export purchases to PDF" },
//     { tag: "purchase:export:excel", group: "Purchase", description: "Export purchases to Excel" },

//     // --- Audit & Verification ---
//     { tag: "purchase:audit:view", group: "Purchase", description: "View purchase audit trail" },
//     { tag: "purchase:audit:export", group: "Purchase", description: "Export audit logs" },
//     { tag: "purchase:reconcile", group: "Purchase", description: "Reconcile purchase accounts" },

//     // --- Supplier Management ---
//     { tag: "purchase:supplier:view", group: "Purchase", description: "View supplier purchase history" },
//     { tag: "purchase:supplier:statement", group: "Purchase", description: "Generate supplier statements" },

//     // --- Inventory Integration ---
//     { tag: "purchase:inventory:update", group: "Purchase", description: "Update inventory from purchases" },
//     { tag: "purchase:stock:adjust", group: "Purchase", description: "Adjust stock from purchase discrepancies" },

//     // --- Advanced Operations ---
//     { tag: "purchase:backdate", group: "Purchase", description: "Create backdated purchases" },
//     { tag: "purchase:price:override", group: "Purchase", description: "Override standard pricing" },
//     { tag: "purchase:discount:apply", group: "Purchase", description: "Apply special discounts" },
//     { tag: "purchase:tax:override", group: "Purchase", description: "Override tax calculations" },

//     // --- Purchase Order Management ---
//     { tag: "purchase:order:create", group: "Purchase", description: "Create purchase orders" },
//     { tag: "purchase:order:update", group: "Purchase", description: "Update purchase orders" },
//     { tag: "purchase:order:approve", group: "Purchase", description: "Approve purchase orders" },
//     { tag: "purchase:order:convert", group: "Purchase", description: "Convert orders to purchases" },

//     // --- Credit Management ---
//     { tag: "purchase:credit:apply", group: "Purchase", description: "Apply supplier credits" },
//     { tag: "purchase:credit:view", group: "Purchase", description: "View supplier credit balance" },
//     { tag: "purchase:credit:adjust", group: "Purchase", description: "Adjust supplier credits" },

//     // --- Approval Workflow ---
//     { tag: "purchase:approval:level1", group: "Purchase", description: "First level purchase approval" },
//     { tag: "purchase:approval:level2", group: "Purchase", description: "Second level purchase approval" },
//     { tag: "purchase:approval:bypass", group: "Purchase", description: "Bypass purchase approval workflow" },
//     { tag: "purchase:approval:level3", group: "Purchase", description: "Bypass purchase approval workflow" },

//     // --- Settings & Configuration ---
//     { tag: "purchase:settings:view", group: "Purchase", description: "View purchase settings" },
//     { tag: "purchase:settings:update", group: "Purchase", description: "Update purchase settings" },
//     { tag: "purchase:terms:manage", group: "Purchase", description: "Manage payment terms" },
//     { tag: "purchase:tax:manage", group: "Purchase", description: "Manage tax settings" },
//     // SUPPLIERS
//     { tag: "supplier:read", group: "Inventory", description: "View Suppliers" },
//     { tag: "supplier:create", group: "Inventory", description: "Create Suppliers" },
//     { tag: "supplier:update", group: "Inventory", description: "Edit Suppliers" },
//     { tag: "supplier:delete", group: "Inventory", description: "Delete Suppliers" },

//     // STOCK MANAGEMENT
//     { tag: "stock:read", group: "Inventory", description: "View stock information" },
//     { tag: "stock:manage", group: "Inventory", description: "Manage stock transfers and adjustments" },
//     { tag: "stock:low_stock", group: "Inventory", description: "View low stock alerts" },
//     { tag: "stock:validate", group: "Inventory", description: "Validate Stock Before Sales" },
//     { tag: "stock:warnings", group: "Inventory", description: "View Low Stock Warnings" },

//     // -----------------------------------------------------------
//     // SALES MANAGEMENT
//     // -----------------------------------------------------------
//     // INVOICES
//     { tag: "invoice:read", group: "Sales", description: "View Invoices" },
//     { tag: "invoice:create", group: "Sales", description: "Create Invoices" },
//     { tag: "invoice:update", group: "Sales", description: "Modify Invoices" },
//     { tag: "invoice:delete", group: "Sales", description: "Delete Invoices" },
//     { tag: "invoice:download", group: "Sales", description: "Download / Email Invoice" },
//     { tag: "invoice:export", group: "Sales", description: "Export Invoices (CSV/Excel)" },
//     { tag: "invoice:history", group: "Sales", description: "View Invoice Audit History" },

//     // DIRECT SALES
//     { tag: "sales:manage", group: "Sales", description: "Manage Direct Sales" },
//     { tag: "sales:view", group: "Sales", description: "View Sales & Exports" },

//     // SALES RETURNS
//     { tag: "sales_return:read", group: "Sales", description: "View sales returns" },
//     { tag: "sales_return:manage", group: "Sales", description: "Create/process sales returns" },

//     // DRAFTS MANAGEMENT
//     { tag: "draft:view", group: "Sales", description: "View Draft Invoices" },
//     { tag: "draft:delete", group: "Sales", description: "Delete Draft Invoices" },
//     { tag: "draft:convert", group: "Sales", description: "Convert Draft to Active" },

//     // BULK OPERATIONS
//     { tag: "bulk:invoice:create", group: "Sales", description: "Bulk Create Invoices" },
//     { tag: "bulk:invoice:update", group: "Sales", description: "Bulk Update Invoice Status" },
//     { tag: "bulk:invoice:cancel", group: "Sales", description: "Bulk Cancel Invoices" },
//     { tag: "bulk:invoice:delete", group: "Sales", description: "Bulk Delete Drafts" },

//     // RECURRING INVOICES
//     { tag: "recurring:invoice:create", group: "Sales", description: "Create Recurring Invoice Templates" },
//     { tag: "recurring:invoice:generate", group: "Sales", description: "Generate Recurring Invoices" },

//     // -----------------------------------------------------------
//     // REPORTS
//     // -----------------------------------------------------------
//     { tag: "report:read", group: "Reports", description: "General Report Access" },
//     { tag: "report:profit", group: "Reports", description: "View Profit Reports" },
//     { tag: "report:sales", group: "Reports", description: "View Sales Reports" },
//     { tag: "report:tax", group: "Reports", description: "View Tax Reports" },
//     { tag: "report:outstanding", group: "Reports", description: "View Outstanding Invoices" },

//     // -----------------------------------------------------------
//     // FINANCE MANAGEMENT
//     // -----------------------------------------------------------
//     // ACCOUNTS
//     { tag: "account:manage", group: "Finance", description: "Manage Chart of Accounts" },

//     // PAYMENTS
//     { tag: "payment:read", group: "Finance", description: "View Payments" },
//     { tag: "payment:create", group: "Finance", description: "Record Payments" },
//     { tag: "payment:update", group: "Finance", description: "Update payment records" },
//     { tag: "payment:delete", group: "Finance", description: "Delete Payments" },

//     // LEDGER
//     { tag: "ledger:read", group: "Finance", description: "View Ledgers" },
//     { tag: "ledger:delete", group: "Finance", description: "Delete Ledger Entries" },

//     // STATEMENTS
//     { tag: "statement:read", group: "Finance", description: "View Statements" },

//     // EMI
//     { tag: "emi:read", group: "Finance", description: "View EMI" },
//     { tag: "emi:create", group: "Finance", description: "Create EMI" },
//     { tag: "emi:pay", group: "Finance", description: "Collect EMI Installments" },
//     { tag: "emi:manage", group: "Finance", description: "Manage EMI plans" },

//     // TRANSACTIONS
//     { tag: "transaction:read", group: "Finance", description: "View Transactions" },

//     // RECONCILIATION
//     { tag: "reconciliation:read", group: "Finance", description: "Reconciliation Reporting" },
//     { tag: "reconciliation:manage", group: "Finance", description: "Perform reconciliations" },

//     // -----------------------------------------------------------
//     // INTEGRATIONS
//     // -----------------------------------------------------------
//     { tag: "integration:webhook", group: "Integrations", description: "Trigger Invoice Webhooks" },
//     { tag: "integration:accounting", group: "Integrations", description: "Sync with Accounting Software" },

//     // -----------------------------------------------------------
//     // AUTOMATION
//     // -----------------------------------------------------------
//     { tag: "automation:read", group: "Automation", description: "View Webhooks & Workflows" },
//     { tag: "automation:manage", group: "Automation", description: "Full Automation CRUD" },
//     { tag: "automation:webhook", group: "Automation", description: "Manage Webhooks" },
//     { tag: "automation:workflow", group: "Automation", description: "Manage Workflows" },

//     // -----------------------------------------------------------
//     // COMMUNICATION
//     // -----------------------------------------------------------
//     // ANNOUNCEMENTS
//     { tag: "announcement:read", group: "Communication", description: "View Announcements" },
//     { tag: "announcement:manage", group: "Communication", description: "Create/Delete Announcements" },

//     // CHAT
//     { tag: "chat:manage_channel", group: "Communication", description: "Create/Edit Channels" },
//     { tag: "chat:send", group: "Communication", description: "Send Messages & Uploads" },
//     { tag: "chat:delete", group: "Communication", description: "Delete Messages" },

//     // NOTIFICATIONS
//     { tag: "notification:read", group: "Communication", description: "View Notifications" },
//     { tag: "notification:manage", group: "Communication", description: "Clear/Delete Notifications" },

//     // -----------------------------------------------------------
//     // SEARCH
//     // -----------------------------------------------------------
//     { tag: "search:global", group: "Search", description: "Use Global Search" },

//     // -----------------------------------------------------------
//     // FILE MANAGEMENT
//     // -----------------------------------------------------------
//     { tag: "file:upload", group: "Files", description: "Upload files to notes and meetings" },
//     { tag: "file:download", group: "Files", description: "Download files" },
//     { tag: "file:delete", group: "Files", description: "Delete files" },
//     { tag: "file:manage", group: "Files", description: "Manage all files" },

//     // -----------------------------------------------------------
//     // SYSTEM ADMINISTRATION
//     // -----------------------------------------------------------
//     // USERS
//     { tag: "user:read", group: "System", description: "View Users" },
//     { tag: "user:manage", group: "System", description: "Manage Users" },

//     // ROLES
//     { tag: "role:manage", group: "System", description: "Manage Roles" },

//     // BRANCHES
//     { tag: "branch:read", group: "System", description: "View Branches" },
//     { tag: "branch:manage", group: "System", description: "Create/Edit Branches" },

//     // MASTER DATA
//     { tag: "master:read", group: "System", description: "View Master Data" },
//     { tag: "master:manage", group: "System", description: "Manage Master Data" },

//     // LOGS & SESSIONS
//     { tag: "logs:view", group: "System", description: "Access System Logs" },
//     { tag: "session:view_all", group: "System", description: "View All Sessions" },

//     // -----------------------------------------------------------
//     // ORGANIZATION MANAGEMENT
//     // -----------------------------------------------------------
//     { tag: "org:manage", group: "Organization", description: "Manage Own Organization" },
//     { tag: "org:manage_members", group: "Organization", description: "Invite/Remove Members" },
//     { tag: "org:transfer", group: "Organization", description: "Transfer Ownership" },
//     { tag: "org:manage_platform", group: "Organization", description: "SuperAdmin — Manage Orgs" },
//     { tag: "ownership:transfer", group: "Organization", description: "Transfer organization ownership" },

//     // -----------------------------------------------------------
//     // ATTENDANCE & TIME MANAGEMENT
//     // -----------------------------------------------------------
//     // Attendance Permissions
//     { tag: "attendance:read", group: "Attendance", description: "View own attendance records" },
//     { tag: "attendance:mark", group: "Attendance", description: "Mark own attendance via web/mobile" },
//     { tag: "attendance:regularize", group: "Attendance", description: "Submit regularization requests" },
//     { tag: "attendance:approve", group: "Attendance", description: "Approve/reject regularization requests" },
//     { tag: "attendance:view_all", group: "Attendance", description: "View all attendance records in organization" },
//     { tag: "attendance:export", group: "Attendance", description: "Export attendance reports" },
//     { tag: "attendance:manage_shifts", group: "Attendance", description: "Create, update, and manage shifts" },
//     { tag: "attendance:manage_holidays", group: "Attendance", description: "Manage holiday calendar" },
//     { tag: "attendance:manage_machines", group: "Attendance", description: "Manage biometric machines" },
//     { tag: "attendance:real_time_monitor", group: "Attendance", description: "View real-time attendance monitoring" },
//     { tag: "attendance:bulk_update", group: "Attendance", description: "Bulk update attendance records" },
//     { tag: "attendance:view_analytics", group: "Attendance", description: "View attendance analytics and dashboards" },
//     { tag: "attendance:manage_leaves", group: "Attendance", description: "Manage leave requests and approvals" },
//     { tag: "attendance:machine_push", group: "Attendance", description: "Push Machine Data" },

//     // TIMESHEETS
//     { tag: "timesheet:read", group: "Attendance", description: "View timesheets" },
//     { tag: "timesheet:submit", group: "Attendance", description: "Submit timesheets" },
//     { tag: "timesheet:approve", group: "Attendance", description: "Approve timesheets" },

//     // HOLIDAYS
//     { tag: "holiday:read", group: "Attendance", description: "View holidays" },
//     { tag: "holiday:manage", group: "Attendance", description: "Create/update/delete holidays" },

//     // SHIFTS
//     { tag: "shift:read", group: "Attendance", description: "View shifts" },
//     { tag: "shift:manage", group: "Attendance", description: "Create/update/delete shifts" },
// ];

// // Now define VALID_TAGS based on PERMISSIONS_LIST
// const VALID_TAGS = PERMISSIONS_LIST.map((p) => p.tag);
// VALID_TAGS.push("*");

// const categorySet = new Set();
// PERMISSIONS_LIST.forEach((p) => {
//     const [category] = p.tag.split(":");
//     categorySet.add(category);
// });

// categorySet.forEach((category) => {
//     const categoryWildcard = `${category}:*`;
//     if (!VALID_TAGS.includes(categoryWildcard)) {
//         VALID_TAGS.push(categoryWildcard);
//     }
// });

// // Now define PERMISSIONS object
// const PERMISSIONS = {};
// PERMISSIONS_LIST.forEach((p) => {
//     const parts = p.tag.split(":");
//     const resource = parts[0];
//     const action = parts.slice(1).join("_"); // Join remaining parts to handle multi-level tags
    
//     const key = resource.toUpperCase();
//     const subKey = action.toUpperCase().replace(/-/g, "_");
    
//     if (!PERMISSIONS[key]) PERMISSIONS[key] = {};
//     PERMISSIONS[key][subKey] = p.tag;
// });

// // Helper function to get permissions by group
// const PERMISSIONS_BY_GROUP = PERMISSIONS_LIST.reduce((acc, permission) => {
//     if (!acc[permission.group]) {
//         acc[permission.group] = [];
//     }
//     acc[permission.group].push(permission);
//     return acc;
// }, {});

// // Helper functions for permission checking
// const hasPermission = (userPermissions, requiredPermission) => {
//     if (!userPermissions || !userPermissions.length) return false;

//     // Check for wildcard permission
//     if (userPermissions.includes("*")) return true;

//     // Check for specific permission
//     if (userPermissions.includes(requiredPermission)) return true;

//     // Check for category wildcard (e.g., "note:*")
//     const [category] = requiredPermission.split(":");
//     const categoryWildcard = `${category}:*`;
//     if (userPermissions.includes(categoryWildcard)) return true;

//     return false;
// };

// const hasAnyPermission = (userPermissions, requiredPermissions) => {
//     return requiredPermissions.some((perm) => hasPermission(userPermissions, perm));
// };

// const hasAllPermissions = (userPermissions, requiredPermissions) => {
//     return requiredPermissions.every((perm) => hasPermission(userPermissions, perm));
// };

// // Get permissions for a specific group
// const getPermissionsByGroup = (groupName) => {
//     return PERMISSIONS_BY_GROUP[groupName] || [];
// };

// // Get all permission groups
// const getPermissionGroups = () => {
//     return Object.keys(PERMISSIONS_BY_GROUP);
// };

// // Validate permissions array
// const validatePermissions = (permissions) => {
//     const invalid = [];
//     const valid = [];

//     permissions.forEach((perm) => {
//         if (VALID_TAGS.includes(perm)) {
//             valid.push(perm);
//         } else {
//             invalid.push(perm);
//         }
//     });

//     return {
//         valid,
//         invalid,
//         isValid: invalid.length === 0,
//     };
// };

// module.exports = {
//     PERMISSIONS,
//     PERMISSIONS_LIST,
//     PERMISSIONS_BY_GROUP,
//     VALID_TAGS,
//     hasPermission,
//     hasAnyPermission,
//     hasAllPermissions,
//     getPermissionsByGroup,
//     getPermissionGroups,
//     validatePermissions,
// };