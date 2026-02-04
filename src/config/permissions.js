const PERMISSIONS_LIST = [
    // -----------------------------------------------------------
    // ANALYTICS — EXECUTIVE & STRATEGIC
    // -----------------------------------------------------------
    { tag: "analytics:view_executive", group: "Analytics", description: "Access Executive Dashboards & KPIs" },
    { tag: "analytics:view_branch_comparison", group: "Analytics", description: "Compare Branch-Level Performance" },
    { tag: "analytics:view_forecast", group: "Analytics", description: "Access Forecasting & Predictive Analysis" },
    { tag: "analytics:view_alerts", group: "Analytics", description: "View Critical Stock & Business Alerts" },
    { tag: "analytics:read", group: "Analytics", description: "General Analytics Access" },

    // FINANCIAL INSIGHT MODULES
    { tag: "analytics:view_financial", group: "Analytics", description: "View Financial Metrics & P&L" },
    { tag: "analytics:view_cashflow", group: "Analytics", description: "View Cash Flow" },
    { tag: "analytics:view_tax", group: "Analytics", description: "View GST/Tax Reports" },
    { tag: "analytics:view_debtor_aging", group: "Analytics", description: "Debtor Ageing Analysis" },
    { tag: "analytics:view_profitability", group: "Analytics", description: "Product/Invoice Profitability" },

    // OPERATIONAL
    { tag: "analytics:view_operational", group: "Analytics", description: "Operational KPIs" },
    { tag: "analytics:view_staff_performance", group: "Analytics", description: "Employee Performance Metrics" },
    { tag: "analytics:view_peak_hours", group: "Analytics", description: "Peak Business Windows" },
    { tag: "analytics:view_procurement", group: "Analytics", description: "Procurement & Supplier Spend" },
    { tag: "analytics:view_customer_insights", group: "Analytics", description: "General Customer Risk & Insights" },

    // INVENTORY INTELLIGENCE
    { tag: "analytics:view_inventory", group: "Analytics", description: "Inventory Valuation" },
    { tag: "analytics:view_product_performance", group: "Analytics", description: "Product Performance" },
    { tag: "analytics:view_dead_stock", group: "Analytics", description: "Dead Stock Reporting" },
    { tag: "analytics:view_stock_forecast", group: "Analytics", description: "Stock-Out Forecasting" },

    // PREDICTIVE / ADVANCED
    { tag: "analytics:view_customer_segmentation", group: "Analytics", description: "RFM Segmentation Analysis" },
    { tag: "analytics:view_customer_retention", group: "Analytics", description: "Cohort & Retention Analysis" },

    // CUSTOMER INTELLIGENCE
    { tag: "analytics:view_customer_ltv", group: "Analytics", description: "Customer Lifetime Value" },
    { tag: "analytics:view_churn", group: "Analytics", description: "Churn Risk Reporting" },
    { tag: "analytics:view_market_basket", group: "Analytics", description: "Market Basket Analysis" },
    { tag: "analytics:view_payment_behavior", group: "Analytics", description: "Payment Pattern Metrics" },

    // SECURITY & EXPORT
    { tag: "analytics:view_security_audit", group: "Analytics", description: "Audit Log Access" },
    { tag: "analytics:export_data", group: "Analytics", description: "Export Analytics Reports" },
    { tag: "analytics:chart_view", group: "Analytics", description: "View chart visualizations" },
    { tag: "analytics:export_charts", group: "Analytics", description: "Export chart data" },

    // -----------------------------------------------------------
    // DASHBOARD
    // -----------------------------------------------------------
    { tag: "dashboard:view", group: "Dashboard", description: "View dashboard overview" },

    // -----------------------------------------------------------
    // NOTE & PLANNER SYSTEM
    // -----------------------------------------------------------
    { tag: "note:read", group: "Notes", description: "View notes, tasks, and journal entries" },
    { tag: "note:write", group: "Notes", description: "Create and update notes" },
    { tag: "note:delete", group: "Notes", description: "Delete notes" },
    { tag: "note:share", group: "Notes", description: "Share notes with other users" },
    { tag: "note:manage_shared", group: "Notes", description: "Manage access to shared notes" },
    { tag: "note:create_template", group: "Notes", description: "Create note templates" },
    { tag: "note:use_template", group: "Notes", description: "Use existing templates" },
    { tag: "note:manage_templates", group: "Notes", description: "Manage organization templates" },
    { tag: "note:view_analytics", group: "Notes", description: "View note analytics and heat maps" },
    { tag: "note:export_data", group: "Notes", description: "Export note data" },
    { tag: "note:bulk_update", group: "Notes", description: "Update multiple notes at once" },
    { tag: "note:bulk_delete", group: "Notes", description: "Delete multiple notes at once" },
    { tag: "note:view_calendar", group: "Notes", description: "View calendar with notes and meetings" },
    { tag: "note:manage_calendar", group: "Notes", description: "Manage calendar events" },
    { tag: "note:convert_task", group: "Notes", description: "Convert notes to tasks" },
    { tag: "note:pin", group: "Notes", description: "Pin important notes" },

    // -----------------------------------------------------------
    // MEETING MANAGEMENT
    // -----------------------------------------------------------
    { tag: "meeting:read", group: "Meetings", description: "View meetings and meeting notes" },
    { tag: "meeting:write", group: "Meetings", description: "Create and update meetings" },
    { tag: "meeting:delete", group: "Meetings", description: "Delete meetings" },
    { tag: "meeting:schedule", group: "Meetings", description: "Schedule new meetings" },
    { tag: "meeting:reschedule", group: "Meetings", description: "Reschedule existing meetings" },
    { tag: "meeting:cancel", group: "Meetings", description: "Cancel meetings" },
    { tag: "meeting:invite", group: "Meetings", description: "Invite participants to meetings" },
    { tag: "meeting:rsvp", group: "Meetings", description: "Accept/decline meeting invitations" },
    { tag: "meeting:manage_participants", group: "Meetings", description: "Manage meeting participants" },
    { tag: "meeting:start", group: "Meetings", description: "Start meetings" },
    { tag: "meeting:end", group: "Meetings", description: "End meetings" },
    { tag: "meeting:record", group: "Meetings", description: "Record meetings" },
    { tag: "meeting:upload_materials", group: "Meetings", description: "Upload meeting materials" },
    { tag: "meeting:manage_materials", group: "Meetings", description: "Manage meeting materials" },
    { tag: "meeting:view_attendance", group: "Meetings", description: "View meeting attendance reports" },
    { tag: "meeting:export_minutes", group: "Meetings", description: "Export meeting minutes" },
    { tag: "meeting:set_reminder", group: "Meetings", description: "Set meeting reminders" },
    { tag: "meeting:recurring", group: "Meetings", description: "Create recurring meetings" },

    // -----------------------------------------------------------
    // TASK MANAGEMENT
    // -----------------------------------------------------------
    { tag: "task:read", group: "Tasks", description: "View tasks" },
    { tag: "task:write", group: "Tasks", description: "Create and update tasks" },
    { tag: "task:delete", group: "Tasks", description: "Delete tasks" },
    { tag: "task:assign", group: "Tasks", description: "Assign tasks to users" },
    { tag: "task:complete", group: "Tasks", description: "Mark tasks as complete" },
    { tag: "task:reopen", group: "Tasks", description: "Reopen completed tasks" },
    { tag: "task:set_priority", group: "Tasks", description: "Set task priority" },
    { tag: "task:set_deadline", group: "Tasks", description: "Set task deadlines" },
    { tag: "task:set_reminder", group: "Tasks", description: "Set task reminders" },
    { tag: "task:add_subtask", group: "Tasks", description: "Add subtasks" },
    { tag: "task:track_time", group: "Tasks", description: "Track time on tasks" },
    { tag: "task:create", group: "Tasks", description: "Create new tasks" },

    // -----------------------------------------------------------
    // PROJECT MANAGEMENT
    // -----------------------------------------------------------
    { tag: "project:read", group: "Projects", description: "View projects" },
    { tag: "project:write", group: "Projects", description: "Update projects" },
    { tag: "project:delete", group: "Projects", description: "Delete projects" },
    { tag: "project:create", group: "Projects", description: "Create new projects" },
    { tag: "project:manage", group: "Projects", description: "Manage projects and team members" },
    { tag: "project:view_analytics", group: "Projects", description: "View project analytics" },
    { tag: "project:manage_milestones", group: "Projects", description: "Manage project milestones" },
    { tag: "project:manage_budget", group: "Projects", description: "Manage project budget" },

    // -----------------------------------------------------------
    // CALENDAR
    // -----------------------------------------------------------
    { tag: "calendar:view", group: "Calendar", description: "View calendar" },
    { tag: "calendar:edit", group: "Calendar", description: "Edit calendar events" },
    { tag: "calendar:manage", group: "Calendar", description: "Manage calendar settings" },
    { tag: "calendar:share", group: "Calendar", description: "Share calendar" },
    { tag: "calendar:sync", group: "Calendar", description: "Sync with external calendars" },

    // -----------------------------------------------------------
    // CUSTOMER MANAGEMENT
    // -----------------------------------------------------------
    { tag: "customer:read", group: "Customers", description: "View Customer Data" },
    { tag: "customer:create", group: "Customers", description: "Create Customer Records" },
    { tag: "customer:update", group: "Customers", description: "Edit Customer Records" },
    { tag: "customer:delete", group: "Customers", description: "Delete Customers" },
    { tag: "customer:credit_limit", group: "Customers", description: "Modify Credit Limits" },

    { tag: "analytics:read", group: "Analytics", description: "View Analytics Dashboards & Charts" },
    { tag: "analytics:export", group: "Analytics", description: "Export Analytics Reports (CSV/Excel)" },
    { tag: "analytics:emi_read", group: "Analytics", description: "View Sensitive EMI & Loan Data" },


    // FEED (Customer Activity)
    { tag: "feed:read", group: "Customers", description: "View customer activity feed" },

    // -----------------------------------------------------------
    // INVENTORY MANAGEMENT
    // -----------------------------------------------------------
    // PRODUCTS
    { tag: "product:read", group: "Inventory", description: "View Products" },
    { tag: "product:create", group: "Inventory", description: "Create Products" },
    { tag: "product:update", group: "Inventory", description: "Edit Products" },
    { tag: "product:delete", group: "Inventory", description: "Delete Products" },
    { tag: "product:stock_adjust", group: "Inventory", description: "Manual Stock Adjustment" },

    // ======================================================
    // PURCHASE PERMISSIONS
    // ======================================================
    // --- Basic CRUD Operations ---
    { tag: "purchase:read", group: "Purchase", description: "View purchase records" },
    { tag: "purchase:create", group: "Purchase", description: "Record new purchases" },
    { tag: "purchase:update", group: "Purchase", description: "Modify purchase records" },
    { tag: "purchase:delete", group: "Purchase", description: "Delete purchases" },

    // --- Financial Operations ---
    { tag: "purchase:payment:record", group: "Purchase", description: "Record payments against purchases" },
    { tag: "purchase:create_payment", group: "Purchase", description: "Create Purchase Payment" }, 
    { tag: "purchase:payment:view", group: "Purchase", description: "View payment history" },
    { tag: "purchase:payment:delete", group: "Purchase", description: "Delete/void payments" },
    { tag: "purchase:payment:bulk", group: "Purchase", description: "Process bulk payments" },

    // --- Return & Cancellation ---
    { tag: "purchase:cancel", group: "Purchase", description: "Cancel entire purchases" },
    { tag: "purchase:return", group: "Purchase", description: "Process partial returns" },
    { tag: "purchase:approve_return", group: "Purchase", description: "Approve purchase returns" },

    // --- Status Management ---
    { tag: "purchase:status:update", group: "Purchase", description: "Update purchase status" },
    { tag: "purchase:approve", group: "Purchase", description: "Approve purchase orders" },
    { tag: "purchase:reject", group: "Purchase", description: "Reject purchase orders" },
    { tag: "purchase:verify", group: "Purchase", description: "Verify received goods" },

    // --- Document Management ---
    { tag: "purchase:attachment:upload", group: "Purchase", description: "Upload purchase attachments" },
    { tag: "purchase:attachment:delete", group: "Purchase", description: "Delete purchase attachments" },
    { tag: "purchase:attachment:view", group: "Purchase", description: "View purchase attachments" },

    // --- Bulk Operations ---
    { tag: "purchase:bulk:create", group: "Purchase", description: "Bulk import purchases" },
    { tag: "purchase:bulk:update", group: "Purchase", description: "Bulk update purchases" },
    { tag: "purchase:bulk:delete", group: "Purchase", description: "Bulk delete purchases" },

    // --- Reports & Analytics ---
    { tag: "purchase:report:view", group: "Purchase", description: "View purchase reports" },
    { tag: "purchase:report:generate", group: "Purchase", description: "Generate purchase reports" },
    { tag: "purchase:analytics:view", group: "Purchase", description: "View purchase analytics" },
    { tag: "purchase:dashboard:view", group: "Purchase", description: "View purchase dashboard" },

    // --- Export Operations ---
    { tag: "purchase:export:csv", group: "Purchase", description: "Export purchases to CSV" },
    { tag: "purchase:export:pdf", group: "Purchase", description: "Export purchases to PDF" },
    { tag: "purchase:export:excel", group: "Purchase", description: "Export purchases to Excel" },

    // --- Audit & Verification ---
    { tag: "purchase:audit:view", group: "Purchase", description: "View purchase audit trail" },
    { tag: "purchase:audit:export", group: "Purchase", description: "Export audit logs" },
    { tag: "purchase:reconcile", group: "Purchase", description: "Reconcile purchase accounts" },

    // --- Supplier Management ---
    { tag: "purchase:supplier:view", group: "Purchase", description: "View supplier purchase history" },
    { tag: "purchase:supplier:statement", group: "Purchase", description: "Generate supplier statements" },

    // --- Inventory Integration ---
    { tag: "purchase:inventory:update", group: "Purchase", description: "Update inventory from purchases" },
    { tag: "purchase:stock:adjust", group: "Purchase", description: "Adjust stock from purchase discrepancies" },

    // --- Advanced Operations ---
    { tag: "purchase:backdate", group: "Purchase", description: "Create backdated purchases" },
    { tag: "purchase:price:override", group: "Purchase", description: "Override standard pricing" },
    { tag: "purchase:discount:apply", group: "Purchase", description: "Apply special discounts" },
    { tag: "purchase:tax:override", group: "Purchase", description: "Override tax calculations" },

    // --- Purchase Order Management ---
    { tag: "purchase:order:create", group: "Purchase", description: "Create purchase orders" },
    { tag: "purchase:order:update", group: "Purchase", description: "Update purchase orders" },
    { tag: "purchase:order:approve", group: "Purchase", description: "Approve purchase orders" },
    { tag: "purchase:order:convert", group: "Purchase", description: "Convert orders to purchases" },

    // --- Credit Management ---
    { tag: "purchase:credit:apply", group: "Purchase", description: "Apply supplier credits" },
    { tag: "purchase:credit:view", group: "Purchase", description: "View supplier credit balance" },
    { tag: "purchase:credit:adjust", group: "Purchase", description: "Adjust supplier credits" },

    // --- Approval Workflow ---
    { tag: "purchase:approval:level1", group: "Purchase", description: "First level purchase approval" },
    { tag: "purchase:approval:level2", group: "Purchase", description: "Second level purchase approval" },
    { tag: "purchase:approval:bypass", group: "Purchase", description: "Bypass purchase approval workflow" },
    { tag: "purchase:approval:level3", group: "Purchase", description: "Bypass purchase approval workflow" },

    // --- Settings & Configuration ---
    { tag: "purchase:settings:view", group: "Purchase", description: "View purchase settings" },
    { tag: "purchase:settings:update", group: "Purchase", description: "Update purchase settings" },
    { tag: "purchase:terms:manage", group: "Purchase", description: "Manage payment terms" },
    { tag: "purchase:tax:manage", group: "Purchase", description: "Manage tax settings" },
    // SUPPLIERS
    { tag: "supplier:read", group: "Inventory", description: "View Suppliers" },
    { tag: "supplier:create", group: "Inventory", description: "Create Suppliers" },
    { tag: "supplier:update", group: "Inventory", description: "Edit Suppliers" },
    { tag: "supplier:delete", group: "Inventory", description: "Delete Suppliers" },

    // STOCK MANAGEMENT
    { tag: "stock:read", group: "Inventory", description: "View stock information" },
    { tag: "stock:manage", group: "Inventory", description: "Manage stock transfers and adjustments" },
    { tag: "stock:low_stock", group: "Inventory", description: "View low stock alerts" },
    { tag: "stock:validate", group: "Inventory", description: "Validate Stock Before Sales" },
    { tag: "stock:warnings", group: "Inventory", description: "View Low Stock Warnings" },

    // -----------------------------------------------------------
    // SALES MANAGEMENT
    // -----------------------------------------------------------
    // INVOICES
    { tag: "invoice:read", group: "Sales", description: "View Invoices" },
    { tag: "invoice:create", group: "Sales", description: "Create Invoices" },
    { tag: "invoice:update", group: "Sales", description: "Modify Invoices" },
    { tag: "invoice:delete", group: "Sales", description: "Delete Invoices" },
    { tag: "invoice:download", group: "Sales", description: "Download / Email Invoice" },
    { tag: "invoice:export", group: "Sales", description: "Export Invoices (CSV/Excel)" },
    { tag: "invoice:history", group: "Sales", description: "View Invoice Audit History" },

    // DIRECT SALES
    { tag: "sales:manage", group: "Sales", description: "Manage Direct Sales" },
    { tag: "sales:view", group: "Sales", description: "View Sales & Exports" },

    // SALES RETURNS
    { tag: "sales_return:read", group: "Sales", description: "View sales returns" },
    { tag: "sales_return:manage", group: "Sales", description: "Create/process sales returns" },

    // DRAFTS MANAGEMENT
    { tag: "draft:view", group: "Sales", description: "View Draft Invoices" },
    { tag: "draft:delete", group: "Sales", description: "Delete Draft Invoices" },
    { tag: "draft:convert", group: "Sales", description: "Convert Draft to Active" },

    // BULK OPERATIONS
    { tag: "bulk:invoice:create", group: "Sales", description: "Bulk Create Invoices" },
    { tag: "bulk:invoice:update", group: "Sales", description: "Bulk Update Invoice Status" },
    { tag: "bulk:invoice:cancel", group: "Sales", description: "Bulk Cancel Invoices" },
    { tag: "bulk:invoice:delete", group: "Sales", description: "Bulk Delete Drafts" },

    // RECURRING INVOICES
    { tag: "recurring:invoice:create", group: "Sales", description: "Create Recurring Invoice Templates" },
    { tag: "recurring:invoice:generate", group: "Sales", description: "Generate Recurring Invoices" },

    // -----------------------------------------------------------
    // REPORTS
    // -----------------------------------------------------------
    { tag: "report:read", group: "Reports", description: "General Report Access" },
    { tag: "report:profit", group: "Reports", description: "View Profit Reports" },
    { tag: "report:sales", group: "Reports", description: "View Sales Reports" },
    { tag: "report:tax", group: "Reports", description: "View Tax Reports" },
    { tag: "report:outstanding", group: "Reports", description: "View Outstanding Invoices" },

    // -----------------------------------------------------------
    // FINANCE MANAGEMENT
    // -----------------------------------------------------------
    // ACCOUNTS
    { tag: "account:manage", group: "Finance", description: "Manage Chart of Accounts" },

    // PAYMENTS
    { tag: "payment:read", group: "Finance", description: "View Payments" },
    { tag: "payment:create", group: "Finance", description: "Record Payments" },
    { tag: "payment:update", group: "Finance", description: "Update payment records" },
    { tag: "payment:delete", group: "Finance", description: "Delete Payments" },

    // LEDGER
    { tag: "ledger:read", group: "Finance", description: "View Ledgers" },
    { tag: "ledger:delete", group: "Finance", description: "Delete Ledger Entries" },

    // STATEMENTS
    { tag: "statement:read", group: "Finance", description: "View Statements" },

    // EMI
    { tag: "emi:read", group: "Finance", description: "View EMI" },
    { tag: "emi:create", group: "Finance", description: "Create EMI" },
    { tag: "emi:pay", group: "Finance", description: "Collect EMI Installments" },
    { tag: "emi:manage", group: "Finance", description: "Manage EMI plans" },

    // TRANSACTIONS
    { tag: "transaction:read", group: "Finance", description: "View Transactions" },

    // RECONCILIATION
    { tag: "reconciliation:read", group: "Finance", description: "Reconciliation Reporting" },
    { tag: "reconciliation:manage", group: "Finance", description: "Perform reconciliations" },

    // -----------------------------------------------------------
    // INTEGRATIONS
    // -----------------------------------------------------------
    { tag: "integration:webhook", group: "Integrations", description: "Trigger Invoice Webhooks" },
    { tag: "integration:accounting", group: "Integrations", description: "Sync with Accounting Software" },

    // -----------------------------------------------------------
    // AUTOMATION
    // -----------------------------------------------------------
    { tag: "automation:read", group: "Automation", description: "View Webhooks & Workflows" },
    { tag: "automation:manage", group: "Automation", description: "Full Automation CRUD" },
    { tag: "automation:webhook", group: "Automation", description: "Manage Webhooks" },
    { tag: "automation:workflow", group: "Automation", description: "Manage Workflows" },

    // -----------------------------------------------------------
    // COMMUNICATION
    // -----------------------------------------------------------
    // ANNOUNCEMENTS
    { tag: "announcement:read", group: "Communication", description: "View Announcements" },
    { tag: "announcement:manage", group: "Communication", description: "Create/Delete Announcements" },

    // CHAT
    { tag: "chat:manage_channel", group: "Communication", description: "Create/Edit Channels" },
    { tag: "chat:send", group: "Communication", description: "Send Messages & Uploads" },
    { tag: "chat:delete", group: "Communication", description: "Delete Messages" },

    // NOTIFICATIONS
    { tag: "notification:read", group: "Communication", description: "View Notifications" },
    { tag: "notification:manage", group: "Communication", description: "Clear/Delete Notifications" },

    // -----------------------------------------------------------
    // SEARCH
    // -----------------------------------------------------------
    { tag: "search:global", group: "Search", description: "Use Global Search" },

    // -----------------------------------------------------------
    // FILE MANAGEMENT
    // -----------------------------------------------------------
    { tag: "file:upload", group: "Files", description: "Upload files to notes and meetings" },
    { tag: "file:download", group: "Files", description: "Download files" },
    { tag: "file:delete", group: "Files", description: "Delete files" },
    { tag: "file:manage", group: "Files", description: "Manage all files" },

    // -----------------------------------------------------------
    // SYSTEM ADMINISTRATION
    // -----------------------------------------------------------
    // USERS
    { tag: "user:read", group: "System", description: "View Users" },
    { tag: "user:manage", group: "System", description: "Manage Users" },

    // ROLES
    { tag: "role:manage", group: "System", description: "Manage Roles" },

    // BRANCHES
    { tag: "branch:read", group: "System", description: "View Branches" },
    { tag: "branch:manage", group: "System", description: "Create/Edit Branches" },

    // MASTER DATA
    { tag: "master:read", group: "System", description: "View Master Data" },
    { tag: "master:manage", group: "System", description: "Manage Master Data" },

    // LOGS & SESSIONS
    { tag: "logs:view", group: "System", description: "Access System Logs" },
    { tag: "session:view_all", group: "System", description: "View All Sessions" },

    // -----------------------------------------------------------
    // ORGANIZATION MANAGEMENT
    // -----------------------------------------------------------
    { tag: "org:manage", group: "Organization", description: "Manage Own Organization" },
    { tag: "org:manage_members", group: "Organization", description: "Invite/Remove Members" },
    { tag: "org:transfer", group: "Organization", description: "Transfer Ownership" },
    { tag: "org:manage_platform", group: "Organization", description: "SuperAdmin — Manage Orgs" },
    { tag: "ownership:transfer", group: "Organization", description: "Transfer organization ownership" },

    // -----------------------------------------------------------
    // ATTENDANCE & TIME MANAGEMENT
    // -----------------------------------------------------------
    // Attendance Permissions
    { tag: "attendance:read", group: "Attendance", description: "View own attendance records" },
    { tag: "attendance:mark", group: "Attendance", description: "Mark own attendance via web/mobile" },
    { tag: "attendance:regularize", group: "Attendance", description: "Submit regularization requests" },
    { tag: "attendance:approve", group: "Attendance", description: "Approve/reject regularization requests" },
    { tag: "attendance:view_all", group: "Attendance", description: "View all attendance records in organization" },
    { tag: "attendance:export", group: "Attendance", description: "Export attendance reports" },
    { tag: "attendance:manage_shifts", group: "Attendance", description: "Create, update, and manage shifts" },
    { tag: "attendance:manage_holidays", group: "Attendance", description: "Manage holiday calendar" },
    { tag: "attendance:manage_machines", group: "Attendance", description: "Manage biometric machines" },
    { tag: "attendance:real_time_monitor", group: "Attendance", description: "View real-time attendance monitoring" },
    { tag: "attendance:bulk_update", group: "Attendance", description: "Bulk update attendance records" },
    { tag: "attendance:view_analytics", group: "Attendance", description: "View attendance analytics and dashboards" },
    { tag: "attendance:manage_leaves", group: "Attendance", description: "Manage leave requests and approvals" },
    { tag: "attendance:machine_push", group: "Attendance", description: "Push Machine Data" },

    // TIMESHEETS
    { tag: "timesheet:read", group: "Attendance", description: "View timesheets" },
    { tag: "timesheet:submit", group: "Attendance", description: "Submit timesheets" },
    { tag: "timesheet:approve", group: "Attendance", description: "Approve timesheets" },

    // HOLIDAYS
    { tag: "holiday:read", group: "Attendance", description: "View holidays" },
    { tag: "holiday:manage", group: "Attendance", description: "Create/update/delete holidays" },

    // SHIFTS
    { tag: "shift:read", group: "Attendance", description: "View shifts" },
    { tag: "shift:manage", group: "Attendance", description: "Create/update/delete shifts" },
];

// Now define VALID_TAGS based on PERMISSIONS_LIST
const VALID_TAGS = PERMISSIONS_LIST.map((p) => p.tag);
VALID_TAGS.push("*");

const categorySet = new Set();
PERMISSIONS_LIST.forEach((p) => {
    const [category] = p.tag.split(":");
    categorySet.add(category);
});

categorySet.forEach((category) => {
    const categoryWildcard = `${category}:*`;
    if (!VALID_TAGS.includes(categoryWildcard)) {
        VALID_TAGS.push(categoryWildcard);
    }
});

// Now define PERMISSIONS object
const PERMISSIONS = {};
PERMISSIONS_LIST.forEach((p) => {
    const parts = p.tag.split(":");
    const resource = parts[0];
    const action = parts.slice(1).join("_"); // Join remaining parts to handle multi-level tags
    
    const key = resource.toUpperCase();
    const subKey = action.toUpperCase().replace(/-/g, "_");
    
    if (!PERMISSIONS[key]) PERMISSIONS[key] = {};
    PERMISSIONS[key][subKey] = p.tag;
});

// Helper function to get permissions by group
const PERMISSIONS_BY_GROUP = PERMISSIONS_LIST.reduce((acc, permission) => {
    if (!acc[permission.group]) {
        acc[permission.group] = [];
    }
    acc[permission.group].push(permission);
    return acc;
}, {});

// Helper functions for permission checking
const hasPermission = (userPermissions, requiredPermission) => {
    if (!userPermissions || !userPermissions.length) return false;

    // Check for wildcard permission
    if (userPermissions.includes("*")) return true;

    // Check for specific permission
    if (userPermissions.includes(requiredPermission)) return true;

    // Check for category wildcard (e.g., "note:*")
    const [category] = requiredPermission.split(":");
    const categoryWildcard = `${category}:*`;
    if (userPermissions.includes(categoryWildcard)) return true;

    return false;
};

const hasAnyPermission = (userPermissions, requiredPermissions) => {
    return requiredPermissions.some((perm) => hasPermission(userPermissions, perm));
};

const hasAllPermissions = (userPermissions, requiredPermissions) => {
    return requiredPermissions.every((perm) => hasPermission(userPermissions, perm));
};

// Get permissions for a specific group
const getPermissionsByGroup = (groupName) => {
    return PERMISSIONS_BY_GROUP[groupName] || [];
};

// Get all permission groups
const getPermissionGroups = () => {
    return Object.keys(PERMISSIONS_BY_GROUP);
};

// Validate permissions array
const validatePermissions = (permissions) => {
    const invalid = [];
    const valid = [];

    permissions.forEach((perm) => {
        if (VALID_TAGS.includes(perm)) {
            valid.push(perm);
        } else {
            invalid.push(perm);
        }
    });

    return {
        valid,
        invalid,
        isValid: invalid.length === 0,
    };
};

module.exports = {
    PERMISSIONS,
    PERMISSIONS_LIST,
    PERMISSIONS_BY_GROUP,
    VALID_TAGS,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getPermissionsByGroup,
    getPermissionGroups,
    validatePermissions,
};


// // config/permissions.js
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
//     // { tag: "attendance:read", group: "Attendance", description: "View attendance records" },
//     // { tag: "attendance:mark", group: "Attendance", description: "Mark own attendance" },
//     // { tag: "attendance:regularize", group: "Attendance", description: "Submit regularization requests" },
//     // { tag: "attendance:approve", group: "Attendance", description: "Approve/reject regularization requests" },
//     // { tag: "attendance:view_all", group: "Attendance", description: "View all attendance records" },
//     // { tag: "attendance:export", group: "Attendance", description: "Export attendance reports" },
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
//     const [resource, action] = p.tag.split(":");
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
