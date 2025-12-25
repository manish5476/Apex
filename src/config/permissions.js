
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

    // PREDICTIVE / ADVANCED (Added missing ones)
    { tag: "analytics:view_customer_segmentation", group: "Analytics", description: "RFM Segmentation Analysis" },
    { tag: "analytics:view_customer_retention", group: "Analytics", description: "Cohort & Retention Analysis" },

    // CUSTOMER INTELLIGENCE — NEW
    { tag: "analytics:view_customer_ltv", group: "Analytics", description: "Customer Lifetime Value" },
    { tag: "analytics:view_churn", group: "Analytics", description: "Churn Risk Reporting" },
    { tag: "analytics:view_market_basket", group: "Analytics", description: "Market Basket Analysis" },
    { tag: "analytics:view_payment_behavior", group: "Analytics", description: "Payment Pattern Metrics" },

    // SECURITY & EXPORT
    { tag: "analytics:view_security_audit", group: "Analytics", description: "Audit Log Access" },
    { tag: "analytics:export_data", group: "Analytics", description: "Export Analytics Reports" },
      // SECURITY & EXPORT
  { tag: "analytics:view_security_audit", group: "Analytics", description: "Audit Log Access" },
  { tag: "analytics:export_data", group: "Analytics", description: "Export Analytics Reports" },

  // -----------------------------------------------------------
  // CUSTOMER
  // -----------------------------------------------------------
  { tag: "customer:read", group: "Customers", description: "View Customer Data" },
  { tag: "customer:create", group: "Customers", description: "Create Customer Records" },
  { tag: "customer:update", group: "Customers", description: "Edit Customer Records" },
  { tag: "customer:delete", group: "Customers", description: "Delete Customers" },
  { tag: "customer:credit_limit", group: "Customers", description: "Modify Credit Limits" },

  // -----------------------------------------------------------
  // INVENTORY (PRODUCTS / PURCHASE / SUPPLIERS)
  // -----------------------------------------------------------
  { tag: "product:read", group: "Inventory", description: "View Products" },
  { tag: "product:create", group: "Inventory", description: "Create Products" },
  { tag: "product:update", group: "Inventory", description: "Edit Products" },
  { tag: "product:delete", group: "Inventory", description: "Delete Products" },
  { tag: "product:stock_adjust", group: "Inventory", description: "Manual Stock Adjustment" },

  { tag: "purchase:read", group: "Inventory", description: "View Purchases" },
  { tag: "purchase:create", group: "Inventory", description: "Record Purchases" },
  { tag: "purchase:update", group: "Inventory", description: "Modify Purchase Records" },
  { tag: "purchase:delete", group: "Inventory", description: "Delete Purchases" },

  { tag: "supplier:read", group: "Inventory", description: "View Suppliers" },
  { tag: "supplier:create", group: "Inventory", description: "Create Suppliers" },
  { tag: "supplier:update", group: "Inventory", description: "Edit Suppliers" },
  { tag: "supplier:delete", group: "Inventory", description: "Delete Suppliers" },

  // -----------------------------------------------------------
  // SALES (Invoices & Direct Sales)
  // -----------------------------------------------------------
  { tag: "invoice:read", group: "Sales", description: "View Invoices" },
  { tag: "invoice:create", group: "Sales", description: "Create Invoices" },
  { tag: "invoice:update", group: "Sales", description: "Modify Invoices" },
  { tag: "invoice:delete", group: "Sales", description: "Delete Invoices" },
  { tag: "invoice:download", group: "Sales", description: "Download / Email Invoice" },

  { tag: "sales:manage", group: "Sales", description: "Manage Direct Sales" },
  { tag: "sales:view", group: "Sales", description: "View Sales & Exports" },

  // -----------------------------------------------------------
  // FINANCE (ACCOUNTS / PAYMENT / LEDGER / EMI / TRANSACTION)
  // -----------------------------------------------------------
  { tag: "account:manage", group: "Finance", description: "Manage Chart of Accounts" },

  { tag: "payment:read", group: "Finance", description: "View Payments" },
  { tag: "payment:create", group: "Finance", description: "Record Payments" },
  { tag: "payment:delete", group: "Finance", description: "Delete Payments" },

  { tag: "ledger:read", group: "Finance", description: "View Ledgers" },
  { tag: "ledger:delete", group: "Finance", description: "Delete Ledger Entries" },

  { tag: "statement:read", group: "Finance", description: "View Statements" },

  { tag: "emi:read", group: "Finance", description: "View EMI" },
  { tag: "emi:create", group: "Finance", description: "Create EMI" },
  { tag: "emi:pay", group: "Finance", description: "Collect EMI Installments" },

  { tag: "reconciliation:read", group: "Finance", description: "Reconciliation Reporting" },
  { tag: "transaction:read", group: "Finance", description: "View Transactions" },

  // -----------------------------------------------------------
  // AUTOMATION / WEBHOOKS / WORKFLOWS
  // -----------------------------------------------------------
  { tag: "automation:read", group: "Automation", description: "View Webhooks & Workflows" },
  { tag: "automation:manage", group: "Automation", description: "Full Automation CRUD" },
  { tag: "automation:webhook", group: "Automation", description: "Manage Webhooks" },
  { tag: "automation:workflow", group: "Automation", description: "Manage Workflows" },

  // -----------------------------------------------------------
  // COMMUNICATION (Chat / Announcement / Notification)
  // -----------------------------------------------------------
  { tag: "announcement:read", group: "Communication", description: "View Announcements" },
  { tag: "announcement:manage", group: "Communication", description: "Create/Delete Announcements" },

  { tag: "chat:manage_channel", group: "Communication", description: "Create/Edit Channels" },
  { tag: "chat:send", group: "Communication", description: "Send Messages & Uploads" },
  { tag: "chat:delete", group: "Communication", description: "Delete Messages" },

  { tag: "notification:read", group: "Communication", description: "View Notifications" },
  { tag: "notification:manage", group: "Communication", description: "Clear/Delete Notifications" },

  // -----------------------------------------------------------
  // NOTES
  // -----------------------------------------------------------
  { tag: "note:read", group: "Utilities", description: "View Notes" },
  { tag: "note:write", group: "Utilities", description: "Create/Update Notes" },
  { tag: "note:delete", group: "Utilities", description: "Delete Notes" },

  // -----------------------------------------------------------
  // SEARCH
  // -----------------------------------------------------------
  { tag: "search:global", group: "Utilities", description: "Use Global Search" },

  // -----------------------------------------------------------
  // SYSTEM / ADMINISTRATIVE
  // -----------------------------------------------------------
  { tag: "user:read", group: "System", description: "View Users" },
  { tag: "user:manage", group: "System", description: "Manage Users" },

  { tag: "role:manage", group: "System", description: "Manage Roles" },

  { tag: "branch:read", group: "System", description: "View Branches" },
  { tag: "branch:manage", group: "System", description: "Create/Edit Branches" },

  { tag: "master:read", group: "System", description: "View Master Data" },
  { tag: "master:manage", group: "System", description: "Manage Master Data" },

  { tag: "logs:view", group: "System", description: "Access System Logs" },
  { tag: "session:view_all", group: "System", description: "View All Sessions" },

  // -----------------------------------------------------------
  // ORGANIZATION
  // -----------------------------------------------------------
  { tag: "org:manage", group: "Organization", description: "Manage Own Organization" },
  { tag: "org:manage_members", group: "Organization", description: "Invite/Remove Members" },
  { tag: "org:transfer", group: "Organization", description: "Transfer Ownership" },
  { tag: "org:manage_platform", group: "Platform", description: "SuperAdmin — Manage Orgs" }
];

const PERMISSIONS = {};
PERMISSIONS_LIST.forEach(p => {
  const [resource, action] = p.tag.split(':');
  const key = resource.toUpperCase();
  const subKey = action.toUpperCase();
  if (!PERMISSIONS[key]) PERMISSIONS[key] = {};
  PERMISSIONS[key][subKey] = p.tag;
});

const VALID_TAGS = PERMISSIONS_LIST.map(p => p.tag);

module.exports = { PERMISSIONS, PERMISSIONS_LIST, VALID_TAGS };


// const PERMISSIONS_LIST = [
//   // -----------------------------
//   // EXECUTIVE & STRATEGIC
//   // -----------------------------
//   { tag: "analytics:view_executive", group: "Analytics", description: "Access Executive Dashboard & Strategic Insights" },
//   { tag: "analytics:view_branch_comparison", group: "Analytics", description: "Compare Branch Performance & Benchmarks" },
//   { tag: "analytics:view_forecast", group: "Analytics", description: "View AI Revenue & Sales Forecasts" },
//   { tag: "analytics:view_alerts", group: "Analytics", description: "View Critical Business Alerts (Risk & Stock)" },

//   // -----------------------------
//   // FINANCIAL REPORTS
//   // -----------------------------
//   { tag: "analytics:view_financial", group: "Analytics", description: "View Financial Summary (P&L, Revenue, Expense)" },
//   { tag: "analytics:view_cashflow", group: "Analytics", description: "View Cash Flow & Payment Mode Breakdown" },
//   { tag: "analytics:view_tax", group: "Analytics", description: "View GST Input/Output Tax Reports" },
//   { tag: "analytics:view_debtor_aging", group: "Analytics", description: "View Debtor Aging (0-90+ Days Analysis)" },
//   { tag: "analytics:view_profitability", group: "Analytics", description: "View Real Gross Profit & Margins" },

//   // -----------------------------
//   // OPERATIONAL & STAFF
//   // -----------------------------
//   { tag: "analytics:view_operational", group: "Analytics", description: "View General Operational Efficiency Metrics" },
//   { tag: "analytics:view_staff_performance", group: "Analytics", description: "View Employee Sales Leaderboard & KPIs" },
//   { tag: "analytics:view_peak_hours", group: "Analytics", description: "View Peak Business Hours & Days Heatmap" },
//   { tag: "analytics:view_procurement", group: "Analytics", description: "View Supplier Spend Analysis" },

//   // -----------------------------
//   // INVENTORY INTELLIGENCE
//   // -----------------------------
//   { tag: "analytics:view_inventory", group: "Analytics", description: "View Inventory Valuation & Stock Overview" },
//   { tag: "analytics:view_product_performance", group: "Analytics", description: "View Best Sellers & High Margin Items" },
//   { tag: "analytics:view_dead_stock", group: "Analytics", description: "View Dead Stock (Non-moving Items > 90 Days)" },
//   { tag: "analytics:view_stock_forecast", group: "Analytics", description: "View Stock-Out Predictions (Run Rate)" },

//   // -----------------------------
//   // CUSTOMER INSIGHTS
//   // -----------------------------
//   { tag: "analytics:view_customer_insights", group: "Analytics", description: "View General Customer Risk Metrics" },
//   { tag: "analytics:view_customer_segmentation", group: "Analytics", description: "View Customer Segments (RFM Analysis)" },
//   { tag: "analytics:view_customer_retention", group: "Analytics", description: "View Cohort Analysis & Retention Rates" },

//   // -----------------------------
//   // SECURITY & SYSTEM
//   // -----------------------------
//   { tag: "analytics:view_security_audit", group: "Analytics", description: "View Sensitive Audit Logs & Suspicious Activity" },
//   { tag: "analytics:export_data", group: "Analytics", description: "Export Reports to CSV/Excel" },

//   // --- CRM (Customers) ---
//   { tag: "customer:read", group: "Customers", description: "View Customer Details" },
//   { tag: "customer:create", group: "Customers", description: "Create Customers" },
//   { tag: "customer:update", group: "Customers", description: "Edit Customers" },
//   { tag: "customer:delete", group: "Customers", description: "Delete Customers" },
//   { tag: "customer:credit_limit", group: "Customers", description: "Update Credit Limits" },

//   // --- INVENTORY (Products, Purchase, Suppliers) ---
//   { tag: "product:read", group: "Inventory", description: "View Products" },
//   { tag: "product:create", group: "Inventory", description: "Create Products" },
//   { tag: "product:update", group: "Inventory", description: "Edit Products" },
//   { tag: "product:delete", group: "Inventory", description: "Delete Products" },
//   { tag: "product:stock_adjust", group: "Inventory", description: "Manual Stock Adjustment" },
  
//   { tag: "purchase:read", group: "Inventory", description: "View Purchases" },
//   { tag: "purchase:create", group: "Inventory", description: "Create Purchases" },
//   { tag: "purchase:update", group: "Inventory", description: "Edit Purchases" },
//   { tag: "purchase:delete", group: "Inventory", description: "Delete Purchases" },

//   { tag: "supplier:read", group: "Inventory", description: "View Suppliers" },
//   { tag: "supplier:create", group: "Inventory", description: "Create Suppliers" },
//   { tag: "supplier:update", group: "Inventory", description: "Edit Suppliers" },
//   { tag: "supplier:delete", group: "Inventory", description: "Delete Suppliers" },

//   // --- SALES (Invoices) ---
//   { tag: "invoice:read", group: "Sales", description: "View Invoices" },
//   { tag: "invoice:create", group: "Sales", description: "Create Invoices" },
//   { tag: "invoice:update", group: "Sales", description: "Edit Invoices" },
//   { tag: "invoice:delete", group: "Sales", description: "Delete Invoices" },
//   { tag: "invoice:download", group: "Sales", description: "Download Invoice PDF" },
//   { tag: "sales:manage", group: "Sales", description: "Manage Direct Sales Records" },

//   // --- FINANCE (Accounts, Payments, Ledgers, EMI) ---
//   { tag: "account:manage", group: "Finance", description: "Manage Chart of Accounts" },
  
//   { tag: "payment:read", group: "Finance", description: "View Payments" },
//   { tag: "payment:create", group: "Finance", description: "Record Payments" },
//   { tag: "payment:delete", group: "Finance", description: "Delete Payments" },
  
//   { tag: "ledger:read", group: "Finance", description: "View Ledgers" },
//   { tag: "ledger:delete", group: "Finance", description: "Delete Ledger Entries" },
  
//   { tag: "statement:read", group: "Finance", description: "View Financial Statements" },
  
//   { tag: "emi:read", group: "Finance", description: "View EMI Data" },
//   { tag: "emi:create", group: "Finance", description: "Create EMI Plans" },
//   { tag: "emi:pay", group: "Finance", description: "Collect EMI Payments" },
  
//   { tag: "reconciliation:read", group: "Finance", description: "View Reconciliation Reports" },
//   { tag: "transaction:read", group: "Finance", description: "View Raw Transactions" },

//   // --- SYSTEM & ADMIN ---
//   { tag: "user:read", group: "System", description: "View Users" },
//   { tag: "user:manage", group: "System", description: "Create/Edit/Delete Users" },
  
//   { tag: "role:manage", group: "System", description: "Manage Roles & Permissions" },
  
//   { tag: "branch:read", group: "System", description: "View Branches" },
//   { tag: "branch:manage", group: "System", description: "Create/Edit Branches" },
  
//   { tag: "master:read", group: "System", description: "View Master Data" },
//   { tag: "master:manage", group: "System", description: "Manage Master Data" },
  
//   { tag: "logs:view", group: "System", description: "View System Logs" },
//   { tag: "session:view_all", group: "System", description: "View All Active Sessions" },
  
//   // --- ORGANIZATION ---
//   { tag: "org:manage", group: "Organization", description: "Manage My Organization Settings" },
//   { tag: "org:manage_members", group: "Organization", description: "Invite/Remove Members" },
//   { tag: "org:transfer", group: "Organization", description: "Transfer Ownership" },
//   { tag: "org:manage_platform", group: "Platform", description: "SuperAdmin: Manage All Orgs" },

//   // --- UTILITIES & AI ---
//   { tag: "ai:chat", group: "Utilities", description: "Use AI Assistant" },
//   { tag: "note:read", group: "Utilities", description: "Read Notes" },
//   { tag: "note:write", group: "Utilities", description: "Create/Edit Notes" },
// ];

// // Helper to create a CONSTANT object for code usage
// const PERMISSIONS = {};
// PERMISSIONS_LIST.forEach(p => {
//   const [resource, action] = p.tag.split(':'); 
//   const key = resource.toUpperCase();
//   const subKey = action.toUpperCase();
//   if (!PERMISSIONS[key]) PERMISSIONS[key] = {};
//   PERMISSIONS[key][subKey] = p.tag;
// });

// const VALID_TAGS = PERMISSIONS_LIST.map(p => p.tag);

// module.exports = { PERMISSIONS, PERMISSIONS_LIST, VALID_TAGS };
