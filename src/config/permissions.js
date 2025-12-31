const PERMISSIONS_LIST = [
    // -----------------------------------------------------------
    // ANALYTICS — EXECUTIVE & STRATEGIC
    // -----------------------------------------------------------
    {
        tag: "analytics:view_executive",
        group: "Analytics",
        description: "Access Executive Dashboards & KPIs",
    },
    {
        tag: "analytics:view_branch_comparison",
        group: "Analytics",
        description: "Compare Branch-Level Performance",
    },
    {
        tag: "analytics:view_forecast",
        group: "Analytics",
        description: "Access Forecasting & Predictive Analysis",
    },
    {
        tag: "analytics:view_alerts",
        group: "Analytics",
        description: "View Critical Stock & Business Alerts",
    },
    {
        tag: "analytics:read",
        group: "Analytics",
        description: "General Analytics Access",
    },

    // FINANCIAL INSIGHT MODULES
    {
        tag: "analytics:view_financial",
        group: "Analytics",
        description: "View Financial Metrics & P&L",
    },
    {
        tag: "analytics:view_cashflow",
        group: "Analytics",
        description: "View Cash Flow",
    },
    {
        tag: "analytics:view_tax",
        group: "Analytics",
        description: "View GST/Tax Reports",
    },
    {
        tag: "analytics:view_debtor_aging",
        group: "Analytics",
        description: "Debtor Ageing Analysis",
    },
    {
        tag: "analytics:view_profitability",
        group: "Analytics",
        description: "Product/Invoice Profitability",
    },

    // OPERATIONAL
    {
        tag: "analytics:view_operational",
        group: "Analytics",
        description: "Operational KPIs",
    },
    {
        tag: "analytics:view_staff_performance",
        group: "Analytics",
        description: "Employee Performance Metrics",
    },
    {
        tag: "analytics:view_peak_hours",
        group: "Analytics",
        description: "Peak Business Windows",
    },
    {
        tag: "analytics:view_procurement",
        group: "Analytics",
        description: "Procurement & Supplier Spend",
    },
    {
        tag: "analytics:view_customer_insights",
        group: "Analytics",
        description: "General Customer Risk & Insights",
    },

    // INVENTORY INTELLIGENCE
    {
        tag: "analytics:view_inventory",
        group: "Analytics",
        description: "Inventory Valuation",
    },
    {
        tag: "analytics:view_product_performance",
        group: "Analytics",
        description: "Product Performance",
    },
    {
        tag: "analytics:view_dead_stock",
        group: "Analytics",
        description: "Dead Stock Reporting",
    },
    {
        tag: "analytics:view_stock_forecast",
        group: "Analytics",
        description: "Stock-Out Forecasting",
    },

    // PREDICTIVE / ADVANCED
    {
        tag: "analytics:view_customer_segmentation",
        group: "Analytics",
        description: "RFM Segmentation Analysis",
    },
    {
        tag: "analytics:view_customer_retention",
        group: "Analytics",
        description: "Cohort & Retention Analysis",
    },

    // CUSTOMER INTELLIGENCE
    {
        tag: "analytics:view_customer_ltv",
        group: "Analytics",
        description: "Customer Lifetime Value",
    },
    {
        tag: "analytics:view_churn",
        group: "Analytics",
        description: "Churn Risk Reporting",
    },
    {
        tag: "analytics:view_market_basket",
        group: "Analytics",
        description: "Market Basket Analysis",
    },
    {
        tag: "analytics:view_payment_behavior",
        group: "Analytics",
        description: "Payment Pattern Metrics",
    },

    // SECURITY & EXPORT
    {
        tag: "analytics:view_security_audit",
        group: "Analytics",
        description: "Audit Log Access",
    },
    {
        tag: "analytics:export_data",
        group: "Analytics",
        description: "Export Analytics Reports",
    },

    // -----------------------------------------------------------
    // NOTE & PLANNER SYSTEM - ENHANCED
    // -----------------------------------------------------------
    {
        tag: "note:read",
        group: "Notes & Planner",
        description: "View notes, tasks, and journal entries",
    },
    {
        tag: "note:write",
        group: "Notes & Planner",
        description: "Create and update notes",
    },
    {
        tag: "note:delete",
        group: "Notes & Planner",
        description: "Delete notes",
    },
    {
        tag: "note:share",
        group: "Notes & Planner",
        description: "Share notes with other users",
    },
    {
        tag: "note:manage_shared",
        group: "Notes & Planner",
        description: "Manage access to shared notes",
    },
    {
        tag: "note:create_template",
        group: "Notes & Planner",
        description: "Create note templates",
    },
    {
        tag: "note:use_template",
        group: "Notes & Planner",
        description: "Use existing templates",
    },
    {
        tag: "note:manage_templates",
        group: "Notes & Planner",
        description: "Manage organization templates",
    },
    {
        tag: "note:view_analytics",
        group: "Notes & Planner",
        description: "View note analytics and heat maps",
    },
    {
        tag: "note:export_data",
        group: "Notes & Planner",
        description: "Export note data",
    },
    {
        tag: "note:bulk_update",
        group: "Notes & Planner",
        description: "Update multiple notes at once",
    },
    {
        tag: "note:bulk_delete",
        group: "Notes & Planner",
        description: "Delete multiple notes at once",
    },
    {
        tag: "note:view_calendar",
        group: "Notes & Planner",
        description: "View calendar with notes and meetings",
    },
    {
        tag: "note:manage_calendar",
        group: "Notes & Planner",
        description: "Manage calendar events",
    },
    {
        tag: "note:convert_task",
        group: "Notes & Planner",
        description: "Convert notes to tasks",
    },
    {
        tag: "note:pin",
        group: "Notes & Planner",
        description: "Pin important notes",
    },

    // -----------------------------------------------------------
    // MEETING MANAGEMENT - COMPREHENSIVE
    // -----------------------------------------------------------
    {
        tag: "meeting:read",
        group: "Meetings",
        description: "View meetings and meeting notes",
    },
    {
        tag: "meeting:write",
        group: "Meetings",
        description: "Create and update meetings",
    },
    {
        tag: "meeting:delete",
        group: "Meetings",
        description: "Delete meetings",
    },
    {
        tag: "meeting:schedule",
        group: "Meetings",
        description: "Schedule new meetings",
    },
    {
        tag: "meeting:reschedule",
        group: "Meetings",
        description: "Reschedule existing meetings",
    },
    {
        tag: "meeting:cancel",
        group: "Meetings",
        description: "Cancel meetings",
    },
    {
        tag: "meeting:invite",
        group: "Meetings",
        description: "Invite participants to meetings",
    },
    {
        tag: "meeting:rsvp",
        group: "Meetings",
        description: "Accept/decline meeting invitations",
    },
    {
        tag: "meeting:manage_participants",
        group: "Meetings",
        description: "Manage meeting participants",
    },
    {
        tag: "meeting:start",
        group: "Meetings",
        description: "Start meetings",
    },
    {
        tag: "meeting:end",
        group: "Meetings",
        description: "End meetings",
    },
    {
        tag: "meeting:record",
        group: "Meetings",
        description: "Record meetings",
    },
    {
        tag: "meeting:upload_materials",
        group: "Meetings",
        description: "Upload meeting materials",
    },
    {
        tag: "meeting:manage_materials",
        group: "Meetings",
        description: "Manage meeting materials",
    },
    {
        tag: "meeting:view_attendance",
        group: "Meetings",
        description: "View meeting attendance reports",
    },
    {
        tag: "meeting:export_minutes",
        group: "Meetings",
        description: "Export meeting minutes",
    },
    {
        tag: "meeting:set_reminder",
        group: "Meetings",
        description: "Set meeting reminders",
    },
    {
        tag: "meeting:recurring",
        group: "Meetings",
        description: "Create recurring meetings",
    },

    // -----------------------------------------------------------
    // TASK MANAGEMENT
    // -----------------------------------------------------------
    {
        tag: "task:read",
        group: "Tasks",
        description: "View tasks",
    },
    {
        tag: "task:write",
        group: "Tasks",
        description: "Create and update tasks",
    },
    {
        tag: "task:delete",
        group: "Tasks",
        description: "Delete tasks",
    },
    {
        tag: "task:assign",
        group: "Tasks",
        description: "Assign tasks to users",
    },
    {
        tag: "task:complete",
        group: "Tasks",
        description: "Mark tasks as complete",
    },
    {
        tag: "task:reopen",
        group: "Tasks",
        description: "Reopen completed tasks",
    },
    {
        tag: "task:set_priority",
        group: "Tasks",
        description: "Set task priority",
    },
    {
        tag: "task:set_deadline",
        group: "Tasks",
        description: "Set task deadlines",
    },
    {
        tag: "task:set_reminder",
        group: "Tasks",
        description: "Set task reminders",
    },
    {
        tag: "task:add_subtask",
        group: "Tasks",
        description: "Add subtasks",
    },
    {
        tag: "task:track_time",
        group: "Tasks",
        description: "Track time on tasks",
    },

    // -----------------------------------------------------------
    // PROJECT MANAGEMENT
    // -----------------------------------------------------------
    {
        tag: "project:read",
        group: "Projects",
        description: "View projects",
    },
    {
        tag: "project:write",
        group: "Projects",
        description: "Update projects",
    },
    {
        tag: "project:delete",
        group: "Projects",
        description: "Delete projects",
    },
    {
        tag: "project:create",
        group: "Projects",
        description: "Create new projects",
    },
    {
        tag: "project:manage",
        group: "Projects",
        description: "Manage projects and team members",
    },
    {
        tag: "project:view_analytics",
        group: "Projects",
        description: "View project analytics",
    },
    {
        tag: "project:manage_milestones",
        group: "Projects",
        description: "Manage project milestones",
    },
    {
        tag: "project:manage_budget",
        group: "Projects",
        description: "Manage project budget",
    },

    // -----------------------------------------------------------
    // CALENDAR
    // -----------------------------------------------------------
    {
        tag: "calendar:view",
        group: "Calendar",
        description: "View calendar",
    },
    {
        tag: "calendar:edit",
        group: "Calendar",
        description: "Edit calendar events",
    },
    {
        tag: "calendar:manage",
        group: "Calendar",
        description: "Manage calendar settings",
    },
    {
        tag: "calendar:share",
        group: "Calendar",
        description: "Share calendar",
    },
    {
        tag: "calendar:sync",
        group: "Calendar",
        description: "Sync with external calendars",
    },

    // -----------------------------------------------------------
    // CUSTOMER
    // -----------------------------------------------------------
    {
        tag: "customer:read",
        group: "Customers",
        description: "View Customer Data",
    },
    {
        tag: "customer:create",
        group: "Customers",
        description: "Create Customer Records",
    },
    {
        tag: "customer:update",
        group: "Customers",
        description: "Edit Customer Records",
    },
    {
        tag: "customer:delete",
        group: "Customers",
        description: "Delete Customers",
    },
    {
        tag: "customer:credit_limit",
        group: "Customers",
        description: "Modify Credit Limits",
    },

    // -----------------------------------------------------------
    // INVENTORY (PRODUCTS / PURCHASE / SUPPLIERS)
    // -----------------------------------------------------------
    { tag: "product:read", group: "Inventory", description: "View Products" },
    {
        tag: "product:create",
        group: "Inventory",
        description: "Create Products",
    },
    { tag: "product:update", group: "Inventory", description: "Edit Products" },
    {
        tag: "product:delete",
        group: "Inventory",
        description: "Delete Products",
    },
    {
        tag: "product:stock_adjust",
        group: "Inventory",
        description: "Manual Stock Adjustment",
    },

    { tag: "purchase:read", group: "Inventory", description: "View Purchases" },
    {
        tag: "purchase:create",
        group: "Inventory",
        description: "Record Purchases",
    },
    {
        tag: "purchase:update",
        group: "Inventory",
        description: "Modify Purchase Records",
    },
    {
        tag: "purchase:delete",
        group: "Inventory",
        description: "Delete Purchases",
    },

    { tag: "supplier:read", group: "Inventory", description: "View Suppliers" },
    {
        tag: "supplier:create",
        group: "Inventory",
        description: "Create Suppliers",
    },
    {
        tag: "supplier:update",
        group: "Inventory",
        description: "Edit Suppliers",
    },
    {
        tag: "supplier:delete",
        group: "Inventory",
        description: "Delete Suppliers",
    },

    // -----------------------------------------------------------
    // SALES (Invoices & Direct Sales)
    // -----------------------------------------------------------
    { tag: "invoice:read", group: "Sales", description: "View Invoices" },
    { tag: "invoice:create", group: "Sales", description: "Create Invoices" },
    { tag: "invoice:update", group: "Sales", description: "Modify Invoices" },
    { tag: "invoice:delete", group: "Sales", description: "Delete Invoices" },
    {
        tag: "invoice:download",
        group: "Sales",
        description: "Download / Email Invoice",
    },

    { tag: "sales:manage", group: "Sales", description: "Manage Direct Sales" },
    { tag: "sales:view", group: "Sales", description: "View Sales & Exports" },

    // -----------------------------------------------------------
    // FINANCE (ACCOUNTS / PAYMENT / LEDGER / EMI / TRANSACTION)
    // -----------------------------------------------------------
    {
        tag: "account:manage",
        group: "Finance",
        description: "Manage Chart of Accounts",
    },

    { tag: "payment:read", group: "Finance", description: "View Payments" },
    { tag: "payment:create", group: "Finance", description: "Record Payments" },
    { tag: "payment:delete", group: "Finance", description: "Delete Payments" },

    { tag: "ledger:read", group: "Finance", description: "View Ledgers" },
    {
        tag: "ledger:delete",
        group: "Finance",
        description: "Delete Ledger Entries",
    },

    { tag: "statement:read", group: "Finance", description: "View Statements" },

    { tag: "emi:read", group: "Finance", description: "View EMI" },
    { tag: "emi:create", group: "Finance", description: "Create EMI" },
    {
        tag: "emi:pay",
        group: "Finance",
        description: "Collect EMI Installments",
    },

    {
        tag: "reconciliation:read",
        group: "Finance",
        description: "Reconciliation Reporting",
    },
    {
        tag: "transaction:read",
        group: "Finance",
        description: "View Transactions",
    },

    // -----------------------------------------------------------
    // AUTOMATION / WEBHOOKS / WORKFLOWS
    // -----------------------------------------------------------
    {
        tag: "automation:read",
        group: "Automation",
        description: "View Webhooks & Workflows",
    },
    {
        tag: "automation:manage",
        group: "Automation",
        description: "Full Automation CRUD",
    },
    {
        tag: "automation:webhook",
        group: "Automation",
        description: "Manage Webhooks",
    },
    {
        tag: "automation:workflow",
        group: "Automation",
        description: "Manage Workflows",
    },

    // -----------------------------------------------------------
    // COMMUNICATION (Chat / Announcement / Notification)
    // -----------------------------------------------------------
    {
        tag: "announcement:read",
        group: "Communication",
        description: "View Announcements",
    },
    {
        tag: "announcement:manage",
        group: "Communication",
        description: "Create/Delete Announcements",
    },

    {
        tag: "chat:manage_channel",
        group: "Communication",
        description: "Create/Edit Channels",
    },
    {
        tag: "chat:send",
        group: "Communication",
        description: "Send Messages & Uploads",
    },
    {
        tag: "chat:delete",
        group: "Communication",
        description: "Delete Messages",
    },

    {
        tag: "notification:read",
        group: "Communication",
        description: "View Notifications",
    },
    {
        tag: "notification:manage",
        group: "Communication",
        description: "Clear/Delete Notifications",
    },

    // -----------------------------------------------------------
    // SEARCH
    // -----------------------------------------------------------
    {
        tag: "search:global",
        group: "Search",
        description: "Use Global Search",
    },

    // -----------------------------------------------------------
    // FILE & ATTACHMENTS
    // -----------------------------------------------------------
    {
        tag: "file:upload",
        group: "Files",
        description: "Upload files to notes and meetings",
    },
    {
        tag: "file:download",
        group: "Files",
        description: "Download files",
    },
    {
        tag: "file:delete",
        group: "Files",
        description: "Delete files",
    },
    {
        tag: "file:manage",
        group: "Files",
        description: "Manage all files",
    },

    // -----------------------------------------------------------
    // SYSTEM / ADMINISTRATIVE
    // -----------------------------------------------------------
    { tag: "user:read", group: "System", description: "View Users" },
    { tag: "user:manage", group: "System", description: "Manage Users" },

    { tag: "role:manage", group: "System", description: "Manage Roles" },

    { tag: "branch:read", group: "System", description: "View Branches" },
    {
        tag: "branch:manage",
        group: "System",
        description: "Create/Edit Branches",
    },

    { tag: "master:read", group: "System", description: "View Master Data" },
    {
        tag: "master:manage",
        group: "System",
        description: "Manage Master Data",
    },

    { tag: "logs:view", group: "System", description: "Access System Logs" },
    {
        tag: "session:view_all",
        group: "System",
        description: "View All Sessions",
    },

    // -----------------------------------------------------------
    // ORGANIZATION
    // -----------------------------------------------------------
    {
        tag: "org:manage",
        group: "Organization",
        description: "Manage Own Organization",
    },
    {
        tag: "org:manage_members",
        group: "Organization",
        description: "Invite/Remove Members",
    },
    {
        tag: "org:transfer",
        group: "Organization",
        description: "Transfer Ownership",
    },
    {
        tag: "org:manage_platform",
        group: "Platform",
        description: "SuperAdmin — Manage Orgs",
    },

    // -----------------------------------------------------------
    // TIME TRACKING & ATTENDANCE
    // -----------------------------------------------------------
    {
        tag: "attendance:read",
        group: "Attendance",
        description: "View attendance records",
    },
    {
        tag: "attendance:mark",
        group: "Attendance",
        description: "Mark attendance",
    },
    {
        tag: "attendance:approve",
        group: "Attendance",
        description: "Approve attendance",
    },
    {
        tag: "attendance:export",
        group: "Attendance",
        description: "Export attendance reports",
    },
    {
        tag: "timesheet:read",
        group: "Attendance",
        description: "View timesheets",
    },
    {
        tag: "timesheet:submit",
        group: "Attendance",
        description: "Submit timesheets",
    },
    {
        tag: "timesheet:approve",
        group: "Attendance",
        description: "Approve timesheets",
    },
];

// Convert to structured object format
const PERMISSIONS = {};
PERMISSIONS_LIST.forEach((p) => {
    const [resource, action] = p.tag.split(":");
    const key = resource.toUpperCase();
    const subKey = action.toUpperCase();
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

// Predefined roles with their permissions
const DEFAULT_ROLES = {
    SUPER_ADMIN: [
        "*", // All permissions
    ],

    ADMIN: [
        // Analytics
        "analytics:*",

        // Notes & Planner (Full access)
        "note:read",
        "note:write",
        "note:delete",
        "note:share",
        "note:manage_shared",
        "note:create_template",
        "note:use_template",
        "note:manage_templates",
        "note:view_analytics",
        "note:export_data",
        "note:bulk_update",
        "note:bulk_delete",
        "note:view_calendar",
        "note:manage_calendar",
        "note:convert_task",
        "note:pin",

        // Meetings (Full access)
        "meeting:read",
        "meeting:write",
        "meeting:delete",
        "meeting:schedule",
        "meeting:reschedule",
        "meeting:cancel",
        "meeting:invite",
        "meeting:manage_participants",
        "meeting:start",
        "meeting:end",
        "meeting:record",
        "meeting:upload_materials",
        "meeting:manage_materials",
        "meeting:view_attendance",
        "meeting:export_minutes",
        "meeting:set_reminder",
        "meeting:recurring",

        // Tasks
        "task:read",
        "task:write",
        "task:delete",
        "task:assign",
        "task:complete",
        "task:reopen",
        "task:set_priority",
        "task:set_deadline",
        "task:set_reminder",
        "task:add_subtask",
        "task:track_time",

        // Projects
        "project:read",
        "project:write",
        "project:delete",
        "project:create",
        "project:manage",
        "project:view_analytics",
        "project:manage_milestones",
        "project:manage_budget",

        // Calendar
        "calendar:view",
        "calendar:edit",
        "calendar:manage",
        "calendar:share",
        "calendar:sync",

        // Customers
        "customer:*",

        // Inventory
        "product:*",
        "purchase:*",
        "supplier:*",

        // Sales
        "invoice:*",
        "sales:*",

        // Finance
        "account:manage",
        "payment:*",
        "ledger:*",
        "statement:read",
        "emi:*",
        "reconciliation:read",
        "transaction:read",

        // Automation
        "automation:*",

        // Communication
        "announcement:*",
        "chat:*",
        "notification:*",

        // Search
        "search:global",

        // Files
        "file:*",

        // System
        "user:*",
        "role:manage",
        "branch:*",
        "master:*",
        "logs:view",
        "session:view_all",

        // Organization
        "org:manage",
        "org:manage_members",
        "org:transfer",

        // Attendance
        "attendance:*",
        "timesheet:*",
    ],

    MANAGER: [
        // Analytics
        "analytics:read",
        "analytics:view_executive",
        "analytics:view_operational",
        "analytics:view_staff_performance",
        "analytics:export_data",

        // Notes & Planner
        "note:read",
        "note:write",
        "note:delete",
        "note:share",
        "note:use_template",
        "note:view_analytics",
        "note:view_calendar",
        "note:manage_calendar",
        "note:convert_task",
        "note:pin",

        // Meetings
        "meeting:read",
        "meeting:write",
        "meeting:delete",
        "meeting:schedule",
        "meeting:invite",
        "meeting:rsvp",
        "meeting:manage_participants",
        "meeting:start",
        "meeting:end",
        "meeting:upload_materials",
        "meeting:view_attendance",
        "meeting:set_reminder",

        // Tasks
        "task:read",
        "task:write",
        "task:delete",
        "task:assign",
        "task:complete",
        "task:reopen",
        "task:set_priority",
        "task:set_deadline",
        "task:set_reminder",

        // Projects
        "project:read",
        "project:write",
        "project:manage",
        "project:view_analytics",

        // Calendar
        "calendar:view",
        "calendar:edit",

        // Customers
        "customer:read",
        "customer:create",
        "customer:update",
        "customer:credit_limit",

        // Inventory
        "product:read",
        "product:create",
        "product:update",
        "product:stock_adjust",
        "purchase:read",
        "purchase:create",
        "purchase:update",
        "supplier:read",
        "supplier:create",
        "supplier:update",

        // Sales
        "invoice:read",
        "invoice:create",
        "invoice:update",
        "invoice:download",
        "sales:manage",
        "sales:view",

        // Finance
        "payment:read",
        "payment:create",
        "ledger:read",
        "statement:read",
        "emi:read",
        "emi:create",
        "emi:pay",
        "transaction:read",

        // Communication
        "announcement:read",
        "announcement:manage",
        "chat:send",
        "notification:read",

        // Search
        "search:global",

        // Files
        "file:upload",
        "file:download",

        // System
        "user:read",
        "branch:read",
        "master:read",

        // Attendance
        "attendance:read",
        "attendance:approve",
        "attendance:export",
        "timesheet:read",
        "timesheet:approve",
    ],

    EMPLOYEE: [
        // Notes & Planner (Personal)
        "note:read",
        "note:write",
        "note:delete",
        "note:share",
        "note:use_template",
        "note:view_calendar",

        // Meetings (Participant)
        "meeting:read",
        "meeting:rsvp",
        "meeting:set_reminder",

        // Tasks (Assigned)
        "task:read",
        "task:write",
        "task:complete",
        "task:reopen",
        "task:set_reminder",
        "task:track_time",

        // Calendar (Personal)
        "calendar:view",

        // Customers (View only)
        "customer:read",

        // Inventory (View only)
        "product:read",
        "purchase:read",
        "supplier:read",

        // Sales (Create/view own)
        "invoice:read",
        "invoice:create",
        "sales:view",

        // Finance (Limited)
        "payment:read",
        "ledger:read",
        "statement:read",
        "transaction:read",

        // Communication
        "announcement:read",
        "chat:send",
        "notification:read",

        // Search
        "search:global",

        // Files
        "file:upload",
        "file:download",

        // Attendance
        "attendance:read",
        "attendance:mark",
        "timesheet:read",
        "timesheet:submit",
    ],

    VIEWER: [
        // Read-only access
        "analytics:read",
        "note:read",
        "note:view_calendar",
        "meeting:read",
        "task:read",
        "project:read",
        "calendar:view",
        "customer:read",
        "product:read",
        "purchase:read",
        "supplier:read",
        "invoice:read",
        "sales:view",
        "payment:read",
        "ledger:read",
        "statement:read",
        "announcement:read",
        "notification:read",
    ],
};

const VALID_TAGS = PERMISSIONS_LIST.map((p) => p.tag);

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
    return requiredPermissions.some((perm) =>
        hasPermission(userPermissions, perm),
    );
};

const hasAllPermissions = (userPermissions, requiredPermissions) => {
    return requiredPermissions.every((perm) =>
        hasPermission(userPermissions, perm),
    );
};

module.exports = {
    PERMISSIONS,
    PERMISSIONS_LIST,
    PERMISSIONS_BY_GROUP,
    DEFAULT_ROLES,
    VALID_TAGS,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
};
// const PERMISSIONS_LIST = [
//     // -----------------------------------------------------------
//     // ANALYTICS — EXECUTIVE & STRATEGIC
//     // -----------------------------------------------------------
//     {
//         tag: "analytics:view_executive",
//         group: "Analytics",
//         description: "Access Executive Dashboards & KPIs",
//     },
//     {
//         tag: "analytics:view_branch_comparison",
//         group: "Analytics",
//         description: "Compare Branch-Level Performance",
//     },
//     {
//         tag: "analytics:view_forecast",
//         group: "Analytics",
//         description: "Access Forecasting & Predictive Analysis",
//     },
//     {
//         tag: "analytics:view_alerts",
//         group: "Analytics",
//         description: "View Critical Stock & Business Alerts",
//     },
//     {
//         tag: "analytics:read",
//         group: "Analytics",
//         description: "General Analytics Access",
//     },

//     // FINANCIAL INSIGHT MODULES
//     {
//         tag: "analytics:view_financial",
//         group: "Analytics",
//         description: "View Financial Metrics & P&L",
//     },
//     {
//         tag: "analytics:view_cashflow",
//         group: "Analytics",
//         description: "View Cash Flow",
//     },
//     {
//         tag: "analytics:view_tax",
//         group: "Analytics",
//         description: "View GST/Tax Reports",
//     },
//     {
//         tag: "analytics:view_debtor_aging",
//         group: "Analytics",
//         description: "Debtor Ageing Analysis",
//     },
//     {
//         tag: "analytics:view_profitability",
//         group: "Analytics",
//         description: "Product/Invoice Profitability",
//     },

//     // OPERATIONAL
//     {
//         tag: "analytics:view_operational",
//         group: "Analytics",
//         description: "Operational KPIs",
//     },
//     {
//         tag: "analytics:view_staff_performance",
//         group: "Analytics",
//         description: "Employee Performance Metrics",
//     },
//     {
//         tag: "analytics:view_peak_hours",
//         group: "Analytics",
//         description: "Peak Business Windows",
//     },
//     {
//         tag: "analytics:view_procurement",
//         group: "Analytics",
//         description: "Procurement & Supplier Spend",
//     },
//     {
//         tag: "analytics:view_customer_insights",
//         group: "Analytics",
//         description: "General Customer Risk & Insights",
//     },

//     // INVENTORY INTELLIGENCE
//     {
//         tag: "analytics:view_inventory",
//         group: "Analytics",
//         description: "Inventory Valuation",
//     },
//     {
//         tag: "analytics:view_product_performance",
//         group: "Analytics",
//         description: "Product Performance",
//     },
//     {
//         tag: "analytics:view_dead_stock",
//         group: "Analytics",
//         description: "Dead Stock Reporting",
//     },
//     {
//         tag: "analytics:view_stock_forecast",
//         group: "Analytics",
//         description: "Stock-Out Forecasting",
//     },

//     // PREDICTIVE / ADVANCED (Added missing ones)
//     {
//         tag: "analytics:view_customer_segmentation",
//         group: "Analytics",
//         description: "RFM Segmentation Analysis",
//     },
//     {
//         tag: "analytics:view_customer_retention",
//         group: "Analytics",
//         description: "Cohort & Retention Analysis",
//     },

//     // CUSTOMER INTELLIGENCE — NEW
//     {
//         tag: "analytics:view_customer_ltv",
//         group: "Analytics",
//         description: "Customer Lifetime Value",
//     },
//     {
//         tag: "analytics:view_churn",
//         group: "Analytics",
//         description: "Churn Risk Reporting",
//     },
//     {
//         tag: "analytics:view_market_basket",
//         group: "Analytics",
//         description: "Market Basket Analysis",
//     },
//     {
//         tag: "analytics:view_payment_behavior",
//         group: "Analytics",
//         description: "Payment Pattern Metrics",
//     },

//     // SECURITY & EXPORT
//     {
//         tag: "analytics:view_security_audit",
//         group: "Analytics",
//         description: "Audit Log Access",
//     },
//     {
//         tag: "analytics:export_data",
//         group: "Analytics",
//         description: "Export Analytics Reports",
//     },
//     // SECURITY & EXPORT
//     {
//         tag: "analytics:view_security_audit",
//         group: "Analytics",
//         description: "Audit Log Access",
//     },
//     {
//         tag: "analytics:export_data",
//         group: "Analytics",
//         description: "Export Analytics Reports",
//     },

//     // -----------------------------------------------------------
//     // CUSTOMER
//     // -----------------------------------------------------------
//     {
//         tag: "customer:read",
//         group: "Customers",
//         description: "View Customer Data",
//     },
//     {
//         tag: "customer:create",
//         group: "Customers",
//         description: "Create Customer Records",
//     },
//     {
//         tag: "customer:update",
//         group: "Customers",
//         description: "Edit Customer Records",
//     },
//     {
//         tag: "customer:delete",
//         group: "Customers",
//         description: "Delete Customers",
//     },
//     {
//         tag: "customer:credit_limit",
//         group: "Customers",
//         description: "Modify Credit Limits",
//     },

//     // -----------------------------------------------------------
//     // INVENTORY (PRODUCTS / PURCHASE / SUPPLIERS)
//     // -----------------------------------------------------------
//     { tag: "product:read", group: "Inventory", description: "View Products" },
//     {
//         tag: "product:create",
//         group: "Inventory",
//         description: "Create Products",
//     },
//     { tag: "product:update", group: "Inventory", description: "Edit Products" },
//     {
//         tag: "product:delete",
//         group: "Inventory",
//         description: "Delete Products",
//     },
//     {
//         tag: "product:stock_adjust",
//         group: "Inventory",
//         description: "Manual Stock Adjustment",
//     },

//     { tag: "purchase:read", group: "Inventory", description: "View Purchases" },
//     {
//         tag: "purchase:create",
//         group: "Inventory",
//         description: "Record Purchases",
//     },
//     {
//         tag: "purchase:update",
//         group: "Inventory",
//         description: "Modify Purchase Records",
//     },
//     {
//         tag: "purchase:delete",
//         group: "Inventory",
//         description: "Delete Purchases",
//     },

//     { tag: "supplier:read", group: "Inventory", description: "View Suppliers" },
//     {
//         tag: "supplier:create",
//         group: "Inventory",
//         description: "Create Suppliers",
//     },
//     {
//         tag: "supplier:update",
//         group: "Inventory",
//         description: "Edit Suppliers",
//     },
//     {
//         tag: "supplier:delete",
//         group: "Inventory",
//         description: "Delete Suppliers",
//     },

//     // -----------------------------------------------------------
//     // SALES (Invoices & Direct Sales)
//     // -----------------------------------------------------------
//     { tag: "invoice:read", group: "Sales", description: "View Invoices" },
//     { tag: "invoice:create", group: "Sales", description: "Create Invoices" },
//     { tag: "invoice:update", group: "Sales", description: "Modify Invoices" },
//     { tag: "invoice:delete", group: "Sales", description: "Delete Invoices" },
//     {
//         tag: "invoice:download",
//         group: "Sales",
//         description: "Download / Email Invoice",
//     },

//     { tag: "sales:manage", group: "Sales", description: "Manage Direct Sales" },
//     { tag: "sales:view", group: "Sales", description: "View Sales & Exports" },

//     // -----------------------------------------------------------
//     // FINANCE (ACCOUNTS / PAYMENT / LEDGER / EMI / TRANSACTION)
//     // -----------------------------------------------------------
//     {
//         tag: "account:manage",
//         group: "Finance",
//         description: "Manage Chart of Accounts",
//     },

//     { tag: "payment:read", group: "Finance", description: "View Payments" },
//     { tag: "payment:create", group: "Finance", description: "Record Payments" },
//     { tag: "payment:delete", group: "Finance", description: "Delete Payments" },

//     { tag: "ledger:read", group: "Finance", description: "View Ledgers" },
//     {
//         tag: "ledger:delete",
//         group: "Finance",
//         description: "Delete Ledger Entries",
//     },

//     { tag: "statement:read", group: "Finance", description: "View Statements" },

//     { tag: "emi:read", group: "Finance", description: "View EMI" },
//     { tag: "emi:create", group: "Finance", description: "Create EMI" },
//     {
//         tag: "emi:pay",
//         group: "Finance",
//         description: "Collect EMI Installments",
//     },

//     {
//         tag: "reconciliation:read",
//         group: "Finance",
//         description: "Reconciliation Reporting",
//     },
//     {
//         tag: "transaction:read",
//         group: "Finance",
//         description: "View Transactions",
//     },

//     // -----------------------------------------------------------
//     // AUTOMATION / WEBHOOKS / WORKFLOWS
//     // -----------------------------------------------------------
//     {
//         tag: "automation:read",
//         group: "Automation",
//         description: "View Webhooks & Workflows",
//     },
//     {
//         tag: "automation:manage",
//         group: "Automation",
//         description: "Full Automation CRUD",
//     },
//     {
//         tag: "automation:webhook",
//         group: "Automation",
//         description: "Manage Webhooks",
//     },
//     {
//         tag: "automation:workflow",
//         group: "Automation",
//         description: "Manage Workflows",
//     },

//     // -----------------------------------------------------------
//     // COMMUNICATION (Chat / Announcement / Notification)
//     // -----------------------------------------------------------
//     {
//         tag: "announcement:read",
//         group: "Communication",
//         description: "View Announcements",
//     },
//     {
//         tag: "announcement:manage",
//         group: "Communication",
//         description: "Create/Delete Announcements",
//     },

//     {
//         tag: "chat:manage_channel",
//         group: "Communication",
//         description: "Create/Edit Channels",
//     },
//     {
//         tag: "chat:send",
//         group: "Communication",
//         description: "Send Messages & Uploads",
//     },
//     {
//         tag: "chat:delete",
//         group: "Communication",
//         description: "Delete Messages",
//     },

//     {
//         tag: "notification:read",
//         group: "Communication",
//         description: "View Notifications",
//     },
//     {
//         tag: "notification:manage",
//         group: "Communication",
//         description: "Clear/Delete Notifications",
//     },

//     // -----------------------------------------------------------
//     // NOTES
//     // -----------------------------------------------------------
//     { tag: "note:read", group: "Utilities", description: "View Notes" },
//     {
//         tag: "note:write",
//         group: "Utilities",
//         description: "Create/Update Notes",
//     },
//     { tag: "note:delete", group: "Utilities", description: "Delete Notes" },
//     { tag: "meeting:read", group: "Utilities", description: "View Notes" },
//     {
//         tag: "meeting:write",
//         group: "Utilities",
//         description: "Create/Update Notes",
//     },
//     { tag: "meeting:delete", group: "Utilities", description: "Delete Notes" },
//     // -----------------------------------------------------------
//     // SEARCH
//     // -----------------------------------------------------------
//     {
//         tag: "search:global",
//         group: "Utilities",
//         description: "Use Global Search",
//     },

//     // -----------------------------------------------------------
//     // SYSTEM / ADMINISTRATIVE
//     // -----------------------------------------------------------
//     { tag: "user:read", group: "System", description: "View Users" },
//     { tag: "user:manage", group: "System", description: "Manage Users" },

//     { tag: "role:manage", group: "System", description: "Manage Roles" },

//     { tag: "branch:read", group: "System", description: "View Branches" },
//     {
//         tag: "branch:manage",
//         group: "System",
//         description: "Create/Edit Branches",
//     },

//     { tag: "master:read", group: "System", description: "View Master Data" },
//     {
//         tag: "master:manage",
//         group: "System",
//         description: "Manage Master Data",
//     },

//     { tag: "logs:view", group: "System", description: "Access System Logs" },
//     {
//         tag: "session:view_all",
//         group: "System",
//         description: "View All Sessions",
//     },

//     // -----------------------------------------------------------
//     // ORGANIZATION
//     // -----------------------------------------------------------
//     {
//         tag: "org:manage",
//         group: "Organization",
//         description: "Manage Own Organization",
//     },
//     {
//         tag: "org:manage_members",
//         group: "Organization",
//         description: "Invite/Remove Members",
//     },
//     {
//         tag: "org:transfer",
//         group: "Organization",
//         description: "Transfer Ownership",
//     },
//     {
//         tag: "org:manage_platform",
//         group: "Platform",
//         description: "SuperAdmin — Manage Orgs",
//     },
// ];

// const PERMISSIONS = {};
// PERMISSIONS_LIST.forEach((p) => {
//     const [resource, action] = p.tag.split(":");
//     const key = resource.toUpperCase();
//     const subKey = action.toUpperCase();
//     if (!PERMISSIONS[key]) PERMISSIONS[key] = {};
//     PERMISSIONS[key][subKey] = p.tag;
// });

// const VALID_TAGS = PERMISSIONS_LIST.map((p) => p.tag);

// module.exports = { PERMISSIONS, PERMISSIONS_LIST, VALID_TAGS };
