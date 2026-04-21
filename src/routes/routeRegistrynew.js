const routes = require('../Indexes/routesIndex');

/**
 * Registers all application routes to the Express app.
 * @param {import('express').Application} app - The Express application instance
 */
const registerRoutes = (app) => {
  const v1Prefix = '/api/v1';

  // --- Auth & Users ---
  app.use(`${v1Prefix}/auth`, routes.authRoutes);
  app.use(`${v1Prefix}/users`, routes.userRoutes);
  app.use(`${v1Prefix}/roles`, routes.roleRoutes);
  app.use(`${v1Prefix}/sessions`, routes.sessionRoutes);

  // --- Accounting & Billing ---
  app.use(`${v1Prefix}/accounts`, routes.accountRoutes);
  app.use(`${v1Prefix}/invoices`, routes.invoiceRoutes);
  app.use(`${v1Prefix}/invoices/pdf`, routes.invoicePDFRoutes);
  app.use(`${v1Prefix}/payments`, routes.paymentRoutes);
  app.use(`${v1Prefix}/emi`, routes.emiRoutes);
  app.use(`${v1Prefix}/ledgers`, routes.ledgersRoutes);
  app.use(`${v1Prefix}/transactions`, routes.transactionRoutes);
  app.use(`${v1Prefix}/reconciliation`, routes.reconciliationRoutes);
  app.use(`${v1Prefix}/statements`, routes.statementsRoutes);
  app.use(`${v1Prefix}/partytransactions`, routes.partyTransactionRoutes);

  // --- Inventory & Sales ---
  app.use(`${v1Prefix}/inventory`, routes.inventoryRoutes);
  app.use(`${v1Prefix}/products`, routes.productRoutes);
  app.use(`${v1Prefix}/purchases`, routes.purchaseRoutes);
  app.use(`${v1Prefix}/sales`, routes.salesRoutes);
  app.use(`${v1Prefix}/sales-returns`, routes.salesReturnRoutes);
  app.use(`${v1Prefix}/stock`, routes.stockRoutes);

  // --- Organization & CRM ---
  app.use(`${v1Prefix}/organization`, routes.organizationRoutes);
  app.use(`${v1Prefix}/neworganization`, routes.organizationExtrasRoutes);
  app.use(`${v1Prefix}/branches`, routes.branchRoutes);
  app.use(`${v1Prefix}/customers`, routes.customerRoutes);
  app.use(`${v1Prefix}/suppliers`, routes.supplierRoutes);
  app.use(`${v1Prefix}/ownership`, routes.ownershipRoutes);

  // --- Master Data ---
  app.use(`${v1Prefix}/master`, routes.masterRoutes);
  app.use(`${v1Prefix}/master-list`, routes.masterListRoutes);
  app.use(`${v1Prefix}/master-types`, routes.masterTypeRoutes);
  app.use(`${v1Prefix}/dropdowns`, routes.dropdownRoutes);

  // --- Utilities, Analytics & Automation ---
  app.use(`${v1Prefix}/analytics`, routes.analyticsRoutes);
  app.use(`${v1Prefix}/customeranalytics`, routes.customerAnalytics);
  app.use(`${v1Prefix}/dashboard`, routes.dashboard);
  app.use(`${v1Prefix}/ai-agent`, routes.aiAgent);
  app.use(`${v1Prefix}/webhooks`, routes.webhookRoutes);
  app.use(`${v1Prefix}/assets`, routes.assetsRoutes);
  app.use(`${v1Prefix}/notifications`, routes.notificationRoutes);
  app.use(`${v1Prefix}/announcements`, routes.announcementRoutes);
  app.use(`${v1Prefix}/cron`, routes.cronRoutes);
  app.use(`${v1Prefix}/search`, routes.searchRoutes);
  app.use(`${v1Prefix}/chart`, routes.chartRoutes);
  app.use(`${v1Prefix}/logs`, routes.logRoutes);
  app.use(`${v1Prefix}/notes`, routes.noteRoutes);
  app.use(`${v1Prefix}/chat`, routes.chatRoutes);
  app.use(`${v1Prefix}/feed`, routes.feedRoutes);

  // --- HRMS Routes ---
  app.use(`${v1Prefix}/hrms`, routes.hrmsRoutes);
  app.use(`${v1Prefix}/departments`, require('../modules/HRMS/routes/core/department.routes'));

  // --- Public Storefront Routes ---
  app.use(`/api/v1/store`, routes.storefrontPublicRoutes);
  app.use(`/api/v1/admin/storefront`, routes.storefrontAdminRoutes);
  app.use(`/api/v1/admin/storefront/smart-rules`, routes.smartRuleRoutes);
};

module.exports = registerRoutes;

module.exports = registerRoutes;