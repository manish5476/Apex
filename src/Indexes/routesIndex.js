module.exports = {
  // --- Core API v1 ---
  authRoutes: require('../routes/v1/auth.routes.js'),
  userRoutes: require('../routes/v1/user.routes.js'),
  roleRoutes: require('../routes/v1/roles.routes.js'),
  organizationRoutes: require('../routes/v1/organization.routes.js'),
  organizationExtrasRoutes: require('../routes/v1/organizationExtras.routes.js'),
  branchRoutes: require('../routes/v1/branch.routes.js'),
  productRoutes: require('../routes/v1/product.routes.js'),
  customerRoutes: require('../routes/v1/customer.routes.js'),
  supplierRoutes: require('../routes/v1/supplier.routes.js'),
  dropdownRoutes: require('../modules/master/core/routes/dropdownlist.routes.js'),

  // --- Transactions & Finance ---
  invoiceRoutes: require('../routes/v1/invoice.routes.js'),
  invoicePDFRoutes: require('../routes/v1/invoicePDF.routes.js'),
  paymentRoutes: require('../routes/v1/payment.routes.js'),
  salesRoutes: require('../routes/v1/sales.routes.js'),
  purchaseRoutes: require('../routes/v1/purchase.routes.js'),
  emiRoutes: require('../routes/v1/emi.routes.js'),
  transactionRoutes: require('../routes/v1/transaction.routes.js'),
  partyTransactionRoutes: require('../routes/v1/partyTransaction.routes.js'),
  ledgersRoutes: require('../routes/v1/ledger.routes.js'),
  statementsRoutes: require('../routes/v1/statements.routes.js'),
  accountRoutes: require('../routes/v1/account.routes.js'),
  reconciliationRoutes: require('../routes/v1/reconciliation.routes.js'),

  // --- Inventory & Logistics ---
  inventoryRoutes: require('../routes/v1/inventory.routes.js'),
  stockRoutes: require('../routes/v1/stock.routes.js'),
  assetsRoutes: require('../routes/v1/asset.routes.js'),

  // --- Analytics & Admin ---
  dashboard: require('../routes/v1/dashboard.routes.js'),
  analyticsRoutes: require('../routes/v1/analytics.routes.js'),
  chartRoutes: require('../routes/v1/chart.routes.js'),
  adminRouter: require('../routes/v1/admin.routes.js'),
  customerAnalytics: require('../routes/v1/customer.analytics.routes.js'),
  logRoutes: require('../routes/v1/log.routes.js'),

  // --- Communication & AI ---
  notificationRoutes: require('../routes/v1/notification.routes.js'),
  noteRoutes: require('../routes/v1/note.routes.js'),
  chatRoutes: require('../routes/v1/chat.routes.js'),
  aiAgent: require('../routes/v1/aiAgent.routes.js'),
  announcementRoutes: require('../routes/v1/announcement.routes.js'),
  feedRoutes: require('../routes/v1/feed.routes.js'),

  // --- System & Master Data ---
  searchRoutes: require('../routes/v1/search.routes.js'),
  masterRoutes: require('../routes/v1/master.routes.js'),
  masterListRoutes: require('../routes/v1/masterList.routes.js'),
  masterTypeRoutes: require('../routes/v1/masterType.routes.js'),
  sessionRoutes: require('../routes/v1/session.routes.js'),
  ownershipRoutes: require('../routes/v1/ownership.routes.js'),
  automationRoutes: require('../routes/v1/automation.routes.js'),
  cronRoutes: require('../routes/v1/cron.routes.js'),

  // --- External/Public Modules ---
  hrmsRoutes: require('../modules/HRMS/routes/index'),
  storefrontPublicRoutes: require('../PublicModules/routes/storefront/public.routes.js'),
  storefrontAdminRoutes: require('../PublicModules/routes/storefront/admin.routes.js'),
  smartRuleRoutes: require('../PublicModules/routes/storefront/smartRule.routes.js'),
};
