const routes = require('../routesIndex.js'); // Imports everything exported from routesIndex.js

/**
 * Registers all application routes to the Express app.
 * @param {import('express').Application} app - The Express application instance
 */
const registerRoutes = (app) => {
  // --- V1 Core API Routes ---
  const v1Prefix = '/api/v1';
  
  // Auth & Users
  app.use(`${v1Prefix}/auth`, routes.authRoutes);
  app.use(`${v1Prefix}/users`, routes.userRoutes);
  app.use(`${v1Prefix}/roles`, routes.rolesRoutes);
  app.use(`${v1Prefix}/sessions`, routes.sessionRoutes);

  // Accounting & Billing
  app.use(`${v1Prefix}/accounts`, routes.accountRoutes);
  app.use(`${v1Prefix}/invoices`, routes.invoiceRoutes);
  app.use(`${v1Prefix}/invoices/pdf`, routes.invoicePdfRoutes);
  app.use(`${v1Prefix}/payments`, routes.paymentRoutes);
  app.use(`${v1Prefix}/emi`, routes.emiRoutes);
  app.use(`${v1Prefix}/ledger`, routes.ledgerRoutes);
  app.use(`${v1Prefix}/transactions`, routes.transactionRoutes);
  app.use(`${v1Prefix}/reconciliation`, routes.reconciliationRoutes);
  app.use(`${v1Prefix}/statements`, routes.statementsRoutes);
  app.use(`${v1Prefix}/party-transactions`, routes.partyTransactionRoutes);

  // Inventory & Sales
  app.use(`${v1Prefix}/inventory`, routes.inventoryRoutes);
  app.use(`${v1Prefix}/products`, routes.productRoutes);
  app.use(`${v1Prefix}/purchases`, routes.purchaseRoutes);
  app.use(`${v1Prefix}/sales`, routes.salesRoutes);
  app.use(`${v1Prefix}/sales-returns`, routes.salesReturnRoutes);
  app.use(`${v1Prefix}/stock`, routes.stockRoutes);

  // Organization & CRM
  app.use(`${v1Prefix}/organization`, routes.organizationRoutes);
  app.use(`${v1Prefix}/branches`, routes.branchRoutes);
  app.use(`${v1Prefix}/customers`, routes.customerRoutes);
  app.use(`${v1Prefix}/suppliers`, routes.supplierRoutes);
  app.use(`${v1Prefix}/ownership`, routes.ownershipRoutes);

  // Master Data
  app.use(`${v1Prefix}/master`, routes.masterRoutes);
  app.use(`${v1Prefix}/master-list`, routes.masterListRoutes);
  app.use(`${v1Prefix}/master-type`, routes.masterTypeRoutes);

  // Utilities, Analytics & Automation
  app.use(`${v1Prefix}/analytics`, routes.analyticsRoutes);
  app.use(`${v1Prefix}/customer-analytics`, routes.customerAnalyticsRoutes);
  app.use(`${v1Prefix}/dashboard`, routes.dashboardRoutes);
  app.use(`${v1Prefix}/ai-agent`, routes.aiAgentRoutes);
  app.use(`${v1Prefix}/automation`, routes.automationRoutes);
  app.use(`${v1Prefix}/assets`, routes.assetRoutes);
  app.use(`${v1Prefix}/notifications`, routes.notificationRoutes);
  app.use(`${v1Prefix}/announcements`, routes.announcementRoutes);
  app.use(`${v1Prefix}/cron`, routes.cronRoutes);
  app.use(`${v1Prefix}/search`, routes.searchRoutes);


  // --- HRMS Routes ---
  const hrmsPrefix = '/api/v1/hrms';
  app.use(`${hrmsPrefix}/attendance-daily`, routes.attendanceDailyRoutes);
  app.use(`${hrmsPrefix}/attendance-logs`, routes.attendanceLogRoutes);
  app.use(`${hrmsPrefix}/attendance-machine`, routes.attendanceMachineRoutes);
  app.use(`${hrmsPrefix}/geo-fence`, routes.geoFenceRoutes);
  app.use(`${hrmsPrefix}/holidays`, routes.holidayRoutes);
  app.use(`${hrmsPrefix}/departments`, routes.departmentRoutes);
  app.use(`${hrmsPrefix}/designations`, routes.designationRoutes);
  app.use(`${hrmsPrefix}/shifts`, routes.hrmsShiftRoutes);
  app.use(`${hrmsPrefix}/shift-groups`, routes.hrmsShiftGroupRoutes);
  app.use(`${hrmsPrefix}/leave-balance`, routes.leaveBalanceRoutes);
  app.use(`${hrmsPrefix}/leave-requests`, routes.leaveRequestRoutes);

  // --- Public Storefront Routes ---
  const storefrontPrefix = '/api/storefront';
  app.use(`${storefrontPrefix}/public`, routes.storefrontPublicRoutes);
  app.use(`${storefrontPrefix}/admin`, routes.storefrontAdminRoutes);
  app.use(`${storefrontPrefix}/smart-rules`, routes.smartRuleRoutes);

  // 404 handler for undefined routes
  app.all('*', (req, res, next) => {
    res.status(404).json({
      status: 'fail',
      message: `Can't find ${req.originalUrl} on this server!`
    });
  });
};

module.exports = registerRoutes;