const PERMISSIONS_LIST = [

//   // -----------------------------
//   // EXECUTIVE & STRATEGIC
//   // -----------------------------
//   { tag: "analytics:view_executive", group: "Analytics", description: "Access Executive Dashboard & Strategic Insights" },
//   { tag: "analytics:view_branch_comparison", group: "Analytics", description: "Compare Branch Performance & Benchmarks" },
//   { tag: "analytics:view_forecast", group: "Analytics", description: "View Revenue & Sales Forecasts" },
//   { tag: "analytics:view_alerts", group: "Analytics", description: "View Critical Business Alerts" },

//   // -----------------------------
//   // FINANCIAL REPORTS
//   // -----------------------------
//   { tag: "analytics:view_financial", group: "Analytics", description: "View Financial Summary Reports (P&L, Revenue, Expense)" },
//   { tag: "analytics:view_cashflow", group: "Analytics", description: "View Cash Flow & Payment Activity" },
//   { tag: "analytics:view_tax", group: "Analytics", description: "View GST/Tax Reports" },
//   { tag: "analytics:view_debtor_aging", group: "Analytics", description: "View Debtor Aging & Outstanding Balances" },
//   { tag: "analytics:view_profitability", group: "Analytics", description: "View Gross Profit & Margin Insights" },

//   // -----------------------------
//   // OPERATIONAL & STAFF ANALYTICS
//   // -----------------------------
//   { tag: "analytics:view_operational", group: "Analytics", description: "View Operational Efficiency Metrics" },
//   { tag: "analytics:view_staff_performance", group: "Analytics", description: "View Employee Sales Leaderboard & KPIs" },
//   { tag: "analytics:view_peak_hours", group: "Analytics", description: "View Peak Business Hour Heatmap" },
//   { tag: "analytics:view_procurement", group: "Analytics", description: "View Supplier & Procurement Spend Analysis" },

//   // -----------------------------
//   // INVENTORY INTELLIGENCE
//   // -----------------------------
//   { tag: "analytics:view_inventory", group: "Analytics", description: "View Inventory Valuation & Stock Levels" },
//   { tag: "analytics:view_product_performance", group: "Analytics", description: "View Best Sellers & Slow Movers" },
//   { tag: "analytics:view_dead_stock", group: "Analytics", description: "View Dead Stock & Non-Moving Items" },
//   { tag: "analytics:view_stock_forecast", group: "Analytics", description: "View Stock Out Predictions" },

//   // -----------------------------
//   // CUSTOMER INSIGHTS
//   // -----------------------------
//   { tag: "analytics:view_customer_segmentation", group: "Analytics", description: "View Customer Segments (RFM)" },
//   { tag: "analytics:view_customer_retention", group: "Analytics", description: "View Cohort & Retention Metrics" },

//   // -----------------------------
//   // SECURITY ANALYTICS
//   // -----------------------------
//   { tag: "analytics:view_security_audit", group: "Analytics", description: "View Audit Logs & Suspicious Activity" },

//   // -----------------------------
//   // EXPORTS
//   // -----------------------------
//   { tag: "analytics:export_data", group: "Analytics", description: "Export Analytics Data (CSV/Excel)" },

// ==============================================================================
  // 📊 ANALYTICS & INTELLIGENCE PERMISSIONS
  // ==============================================================================

  // -----------------------------
  // EXECUTIVE & STRATEGIC
  // -----------------------------
  { tag: "analytics:view_executive", group: "Analytics", description: "Access Executive Dashboard & Strategic Insights" },
  { tag: "analytics:view_branch_comparison", group: "Analytics", description: "Compare Branch Performance & Benchmarks" },
  { tag: "analytics:view_forecast", group: "Analytics", description: "View AI Revenue & Sales Forecasts" },
  { tag: "analytics:view_alerts", group: "Analytics", description: "View Critical Business Alerts (Risk & Stock)" },

  // -----------------------------
  // FINANCIAL REPORTS
  // -----------------------------
  { tag: "analytics:view_financial", group: "Analytics", description: "View Financial Summary (P&L, Revenue, Expense)" },
  { tag: "analytics:view_cashflow", group: "Analytics", description: "View Cash Flow & Payment Mode Breakdown" },
  { tag: "analytics:view_tax", group: "Analytics", description: "View GST Input/Output Tax Reports" },
  { tag: "analytics:view_debtor_aging", group: "Analytics", description: "View Debtor Aging (0-90+ Days Analysis)" },
  { tag: "analytics:view_profitability", group: "Analytics", description: "View Real Gross Profit & Margins" },

  // -----------------------------
  // OPERATIONAL & STAFF
  // -----------------------------
  { tag: "analytics:view_operational", group: "Analytics", description: "View General Operational Efficiency Metrics" },
  { tag: "analytics:view_staff_performance", group: "Analytics", description: "View Employee Sales Leaderboard & KPIs" },
  { tag: "analytics:view_peak_hours", group: "Analytics", description: "View Peak Business Hours & Days Heatmap" },
  { tag: "analytics:view_procurement", group: "Analytics", description: "View Supplier Spend Analysis" },

  // -----------------------------
  // INVENTORY INTELLIGENCE
  // -----------------------------
  { tag: "analytics:view_inventory", group: "Analytics", description: "View Inventory Valuation & Stock Overview" },
  { tag: "analytics:view_product_performance", group: "Analytics", description: "View Best Sellers & High Margin Items" },
  { tag: "analytics:view_dead_stock", group: "Analytics", description: "View Dead Stock (Non-moving Items > 90 Days)" },
  { tag: "analytics:view_stock_forecast", group: "Analytics", description: "View Stock-Out Predictions (Run Rate)" },

  // -----------------------------
  // CUSTOMER INSIGHTS
  // -----------------------------
  { tag: "analytics:view_customer_insights", group: "Analytics", description: "View General Customer Risk Metrics" },
  { tag: "analytics:view_customer_segmentation", group: "Analytics", description: "View Customer Segments (RFM Analysis)" },
  { tag: "analytics:view_customer_retention", group: "Analytics", description: "View Cohort Analysis & Retention Rates" },

  // -----------------------------
  // SECURITY & SYSTEM
  // -----------------------------
  { tag: "analytics:view_security_audit", group: "Analytics", description: "View Sensitive Audit Logs & Suspicious Activity" },
  { tag: "analytics:export_data", group: "Analytics", description: "Export Reports to CSV/Excel" },

  // --- CRM (Customers) ---
  { tag: "customer:read", group: "Customers", description: "View Customer Details" },
  { tag: "customer:create", group: "Customers", description: "Create Customers" },
  { tag: "customer:update", group: "Customers", description: "Edit Customers" },
  { tag: "customer:delete", group: "Customers", description: "Delete Customers" },
  { tag: "customer:credit_limit", group: "Customers", description: "Update Credit Limits" },

  // --- INVENTORY (Products, Purchase, Suppliers) ---
  { tag: "product:read", group: "Inventory", description: "View Products" },
  { tag: "product:create", group: "Inventory", description: "Create Products" },
  { tag: "product:update", group: "Inventory", description: "Edit Products" },
  { tag: "product:delete", group: "Inventory", description: "Delete Products" },
  { tag: "product:stock_adjust", group: "Inventory", description: "Manual Stock Adjustment" },
  
  { tag: "purchase:read", group: "Inventory", description: "View Purchases" },
  { tag: "purchase:create", group: "Inventory", description: "Create Purchases" },
  { tag: "purchase:update", group: "Inventory", description: "Edit Purchases" },
  { tag: "purchase:delete", group: "Inventory", description: "Delete Purchases" },

  { tag: "supplier:read", group: "Inventory", description: "View Suppliers" },
  { tag: "supplier:create", group: "Inventory", description: "Create Suppliers" },
  { tag: "supplier:update", group: "Inventory", description: "Edit Suppliers" },
  { tag: "supplier:delete", group: "Inventory", description: "Delete Suppliers" },

  // --- SALES (Invoices) ---
  { tag: "invoice:read", group: "Sales", description: "View Invoices" },
  { tag: "invoice:create", group: "Sales", description: "Create Invoices" },
  { tag: "invoice:update", group: "Sales", description: "Edit Invoices" },
  { tag: "invoice:delete", group: "Sales", description: "Delete Invoices" },
  { tag: "invoice:download", group: "Sales", description: "Download Invoice PDF" },
  { tag: "sales:manage", group: "Sales", description: "Manage Direct Sales Records" },

  // --- FINANCE (Accounts, Payments, Ledgers, EMI) ---
  { tag: "account:manage", group: "Finance", description: "Manage Chart of Accounts" },
  
  { tag: "payment:read", group: "Finance", description: "View Payments" },
  { tag: "payment:create", group: "Finance", description: "Record Payments" },
  { tag: "payment:delete", group: "Finance", description: "Delete Payments" },
  
  { tag: "ledger:read", group: "Finance", description: "View Ledgers" },
  { tag: "ledger:delete", group: "Finance", description: "Delete Ledger Entries" },
  
  { tag: "statement:read", group: "Finance", description: "View Financial Statements" },
  
  { tag: "emi:read", group: "Finance", description: "View EMI Data" },
  { tag: "emi:create", group: "Finance", description: "Create EMI Plans" },
  { tag: "emi:pay", group: "Finance", description: "Collect EMI Payments" },
  
  { tag: "reconciliation:read", group: "Finance", description: "View Reconciliation Reports" },
  { tag: "transaction:read", group: "Finance", description: "View Raw Transactions" },

  // --- SYSTEM & ADMIN ---
  { tag: "user:read", group: "System", description: "View Users" },
  { tag: "user:manage", group: "System", description: "Create/Edit/Delete Users" },
  
  { tag: "role:manage", group: "System", description: "Manage Roles & Permissions" },
  
  { tag: "branch:read", group: "System", description: "View Branches" },
  { tag: "branch:manage", group: "System", description: "Create/Edit Branches" },
  
  { tag: "master:read", group: "System", description: "View Master Data" },
  { tag: "master:manage", group: "System", description: "Manage Master Data" },
  
  { tag: "logs:view", group: "System", description: "View System Logs" },
  { tag: "session:view_all", group: "System", description: "View All Active Sessions" },
  
  // --- ORGANIZATION ---
  { tag: "org:manage", group: "Organization", description: "Manage My Organization Settings" },
  { tag: "org:manage_members", group: "Organization", description: "Invite/Remove Members" },
  { tag: "org:transfer", group: "Organization", description: "Transfer Ownership" },
  { tag: "org:manage_platform", group: "Platform", description: "SuperAdmin: Manage All Orgs" },

  // --- UTILITIES & AI ---
  { tag: "ai:chat", group: "Utilities", description: "Use AI Assistant" },
  { tag: "note:read", group: "Utilities", description: "Read Notes" },
  { tag: "note:write", group: "Utilities", description: "Create/Edit Notes" },
];

// Helper to create a CONSTANT object for code usage
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

// // src/config/permissions.js

// const PERMISSIONS_LIST = [
//   // --- ANALYTICS & DASHBOARD ---
//   { tag: "analytics:view_executive", group: "Analytics", description: "View Executive Dashboard (C-Level)" },
//   { tag: "analytics:view_financial", group: "Analytics", description: "View P&L and Cash Flow Reports" },
//   { tag: "analytics:view_operational", group: "Analytics", description: "View Inventory & Product Reports" },

//   // --- CRM (Customers) ---
//   { tag: "customer:read", group: "Customers", description: "View Customer Details" },
//   { tag: "customer:create", group: "Customers", description: "Create Customers" },
//   { tag: "customer:update", group: "Customers", description: "Edit Customers" },
//   { tag: "customer:delete", group: "Customers", description: "Delete Customers" },
//   { tag: "customer:credit_limit", group: "Customers", description: "Update Credit Limits" },

//   // --- INVENTORY (Products & Purchase) ---
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

// // -------------------------------------------------------------
// // Auto-generate the Object Structure
// // Result: PERMISSIONS.CUSTOMER.READ, PERMISSIONS.INVOICE.CREATE
// // -------------------------------------------------------------
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

// // // This structure is designed to be exported to Angular for the UI
// // const PERMISSIONS_LIST = [
// //   // --- DASHBOARD & ANALYTICS ---
// //   { tag: "analytics:view_executive", group: "Analytics", description: "View Executive Dashboard (C-Level)" },
// //   { tag: "analytics:view_financial", group: "Analytics", description: "View P&L and Cash Flow Reports" },
// //   { tag: "analytics:view_operational", group: "Analytics", description: "View Operational Reports (Inventory/Product)" },

// //   // --- CUSTOMERS ---
// //   { tag: "customer:read", group: "Customers", description: "View Customer List & Details" },
// //   { tag: "customer:create", group: "Customers", description: "Create New Customers" },
// //   { tag: "customer:update", group: "Customers", description: "Edit Customer Details" },
// //   { tag: "customer:delete", group: "Customers", description: "Delete/Deactivate Customers" },
// //   { tag: "customer:credit_limit", group: "Customers", description: "Update Credit Limits" },

// //   // --- SUPPLIERS ---
// //   { tag: "supplier:read", group: "Suppliers", description: "View Suppliers" },
// //   { tag: "supplier:create", group: "Suppliers", description: "Create Suppliers" },
// //   { tag: "supplier:update", group: "Suppliers", description: "Edit Suppliers" },
// //   { tag: "supplier:delete", group: "Suppliers", description: "Delete Suppliers" },

// //   // --- PRODUCTS ---
// //   { tag: "product:read", group: "Products", description: "View Products" },
// //   { tag: "product:create", group: "Products", description: "Create Products" },
// //   { tag: "product:update", group: "Products", description: "Edit Products" },
// //   { tag: "product:delete", group: "Products", description: "Delete Products" },
// //   { tag: "product:stock_adjust", group: "Products", description: "Manually Adjust Stock Levels" },

// //   // --- INVOICES ---
// //   { tag: "invoice:read", group: "Sales", description: "View Invoices" },
// //   { tag: "invoice:create", group: "Sales", description: "Create Invoices" },
// //   { tag: "invoice:update", group: "Sales", description: "Edit Invoices" },
// //   { tag: "invoice:delete", group: "Sales", description: "Delete Invoices" },
// //   { tag: "invoice:download", group: "Sales", description: "Download Invoice PDF" },

// //   // --- PAYMENTS & EMI ---
// //   { tag: "payment:read", group: "Finance", description: "View Payment History" },
// //   { tag: "payment:create", group: "Finance", description: "Record New Payments" },
// //   { tag: "emi:manage", group: "Finance", description: "Manage and Collect EMI" },

// //   // --- ACCOUNTS & LEDGERS ---
// //   { tag: "account:manage", group: "Finance", description: "Manage Chart of Accounts" },
// //   { tag: "ledger:read", group: "Finance", description: "View General Ledgers" },
// //   { tag: "statement:read", group: "Finance", description: "View Financial Statements (Balance Sheet/Trial Balance)" },

// //   // --- PURCHASES ---
// //   { tag: "purchase:read", group: "Inventory", description: "View Purchase Orders" },
// //   { tag: "purchase:create", group: "Inventory", description: "Create Purchase Orders" },
// //   { tag: "purchase:update", group: "Inventory", description: "Edit Purchases" },

// //   // --- SYSTEM & ADMIN ---
// //   { tag: "user:manage", group: "System", description: "Manage Users (Create/Delete/Passwords)" },
// //   { tag: "role:manage", group: "System", description: "Create and Assign Roles" },
// //   { tag: "branch:manage", group: "System", description: "Create and Manage Branches" },
// //   { tag: "org:manage", group: "System", description: "Manage Organization Settings" },
// //   { tag: "logs:view", group: "System", description: "View System Logs" },
// //   { tag: "master:manage", group: "System", description: "Manage Master Data" }
// // ];

// // // Helper to create a CONSTANT object for code usage
// // // Result: { CUSTOMER: { READ: 'customer:read', ... } }
// // const PERMISSIONS = {};
// // PERMISSIONS_LIST.forEach(p => {
// //   const [resource, action] = p.tag.split(':'); // e.g., "customer" and "read"
// //   const key = resource.toUpperCase();
// //   const subKey = action.toUpperCase();
// //   if (!PERMISSIONS[key]) PERMISSIONS[key] = {};
// //   PERMISSIONS[key][subKey] = p.tag;
// // });

// // // Extract simple array of valid tags for Mongoose Validation
// // const VALID_TAGS = PERMISSIONS_LIST.map(p => p.tag);

// // module.exports = { PERMISSIONS, PERMISSIONS_LIST, VALID_TAGS };