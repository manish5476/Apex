const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/analyticsController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

// All analytics routes require authentication
router.use(authController.protect);

/**
 * UTILITY: Common Query Parameters
 * Most endpoints accept the following optional query params:
 * - startDate (YYYY-MM-DD): Filter start date (defaults to start of current month)
 * - endDate (YYYY-MM-DD): Filter end date (defaults to end of current day)
 * - branchId (ObjectId): Filter by specific branch (defaults to all branches in org)
 */

// ==========================================================================
// 1. EXECUTIVE & STRATEGIC
// ==========================================================================

// GET /api/v1/analytics/dashboard
// Params: startDate, endDate, branchId
router.get(
    '/dashboard', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), 
    analyticsController.getDashboardOverview
);

// GET /api/v1/analytics/branch-comparison
// Params: startDate, endDate
router.get(
    '/branch-comparison', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON), 
    analyticsController.getBranchComparison
);

// ==========================================================================
// 2. FINANCIAL
// ==========================================================================

// GET /api/v1/analytics/financials
// Params: startDate, endDate, branchId, interval ('day' | 'month' | 'year')
router.get(
    '/financials', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), 
    analyticsController.getFinancialReport
);

// GET /api/v1/analytics/profitability
// Params: startDate, endDate, branchId
router.get(
    '/profitability', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY), 
    analyticsController.getProfitabilityReport
);

// GET /api/v1/analytics/cash-flow
// Params: startDate, endDate, branchId
router.get(
    '/cash-flow', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW), 
    analyticsController.getCashFlowReport
);

// GET /api/v1/analytics/tax-report
// Params: startDate, endDate, branchId
router.get(
    '/tax-report', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX), 
    analyticsController.getTaxReport
);

// GET /api/v1/analytics/debtor-aging
// Params: branchId
router.get(
    '/debtor-aging', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING), 
    analyticsController.getDebtorAgingReport
);

// ==========================================================================
// 3. OPERATIONAL
// ==========================================================================

// GET /api/v1/analytics/staff-performance
// Params: startDate, endDate, branchId
router.get(
    '/staff-performance', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE), 
    analyticsController.getStaffPerformance
);

// GET /api/v1/analytics/operational-metrics
// Params: startDate, endDate, branchId
router.get(
    '/operational-metrics', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
    analyticsController.getOperationalMetrics
);

// GET /api/v1/analytics/peak-hours
// Params: branchId (Analyzes last 30 days by default)
router.get(
    '/peak-hours', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS), 
    analyticsController.getPeakBusinessHours
);

// GET /api/v1/analytics/procurement
// Params: startDate, endDate, branchId
router.get(
    '/procurement', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT), 
    analyticsController.getProcurementAnalysis
);

// GET /api/v1/analytics/customer-insights
// Params: branchId
router.get(
    '/customer-insights', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS), 
    analyticsController.getCustomerInsights
);

// ==========================================================================
// 4. INVENTORY
// ==========================================================================

// GET /api/v1/analytics/inventory
// Params: branchId
router.get(
    '/inventory', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY), 
    analyticsController.getInventoryReport
);

// GET /api/v1/analytics/product-performance
// Params: branchId
router.get(
    '/product-performance', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE), 
    analyticsController.getProductPerformance
);

// GET /api/v1/analytics/dead-stock
// Params: branchId, daysThreshold (number, default: 90)
router.get(
    '/dead-stock', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK), 
    analyticsController.getDeadStockReport
);

// GET /api/v1/analytics/stock-predictions
// Params: branchId
router.get(
    '/stock-predictions', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST), 
    analyticsController.getStockOutPredictions
);

// ==========================================================================
// 5. PREDICTIVE
// ==========================================================================

// GET /api/v1/analytics/forecast
// Params: branchId
router.get(
    '/forecast', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST), 
    analyticsController.getSalesForecast
);

// GET /api/v1/analytics/customer-segmentation
// Params: None (Analyzes full customer base)
router.get(
    '/customer-segmentation', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION), 
    analyticsController.getCustomerSegmentation
);

// GET /api/v1/analytics/customer-retention
// Params: months (number, default: 6)
router.get(
    '/customer-retention', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION), 
    analyticsController.getCustomerRetention
);

// GET /api/v1/analytics/critical-alerts
// Params: branchId
router.get(
    '/critical-alerts', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS), 
    analyticsController.getCriticalAlerts
);

// ==========================================================================
// 6. CUSTOMER INTELLIGENCE (NEW)
// ==========================================================================

// GET /api/v1/analytics/customer-ltv
// Params: branchId
router.get(
    '/customer-ltv', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV), 
    analyticsController.getCustomerLifetimeValue
);

// GET /api/v1/analytics/churn-risk
// Params: daysThreshold (number, default: 90)
router.get(
    '/churn-risk', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN), 
    analyticsController.getChurnRiskAnalysis
);

// GET /api/v1/analytics/market-basket
// Params: minSupport (number, default: 2)
router.get(
    '/market-basket', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET), 
    analyticsController.getMarketBasketAnalysis
);

// GET /api/v1/analytics/payment-behavior
// Params: branchId
router.get(
    '/payment-behavior', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR), 
    analyticsController.getPaymentBehaviorStats
);

// ==========================================================================
// 7. SECURITY / EXPORT
// ==========================================================================

// GET /api/v1/analytics/security-audit
// Params: startDate, endDate
router.get(
    '/security-audit', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT), 
    analyticsController.getSecurityAuditLog
);

// GET /api/v1/analytics/export
// Params: startDate, endDate, type ('sales'|'inventory'|'tax'), format ('csv'|'json', default: 'csv')
router.get(
    '/export', 
    checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA), 
    analyticsController.exportAnalyticsData
);

module.exports = router; 







// const express = require('express');
// const router = express.Router();
// const analyticsController = require('../../controllers/analyticsController');
// const authController = require('../../controllers/authController');
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// // Executive
// router.get('/dashboard', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), analyticsController.getDashboardOverview);
// router.get('/branch-comparison', checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON), analyticsController.getBranchComparison);

// // Financial
// router.get('/financials', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getFinancialReport);
// router.get('/profitability', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY), analyticsController.getProfitabilityReport);
// router.get('/cash-flow', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW), analyticsController.getCashFlowReport);
// router.get('/tax-report', checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX), analyticsController.getTaxReport);
// router.get('/debtor-aging', checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING), analyticsController.getDebtorAgingReport);

// // Operational
// router.get('/staff-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE), analyticsController.getStaffPerformance);
// router.get('/operational-metrics', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getOperationalMetrics);
// router.get('/peak-hours', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS), analyticsController.getPeakBusinessHours);
// router.get('/procurement', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT), analyticsController.getProcurementAnalysis);
// router.get('/customer-insights', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS), analyticsController.getCustomerInsights);

// // Inventory
// router.get('/inventory', checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY), analyticsController.getInventoryReport);
// router.get('/product-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE), analyticsController.getProductPerformance);
// router.get('/dead-stock', checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK), analyticsController.getDeadStockReport);
// router.get('/stock-predictions', checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST), analyticsController.getStockOutPredictions);

// // Predictive
// router.get('/forecast', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST), analyticsController.getSalesForecast);
// router.get('/customer-segmentation', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION), analyticsController.getCustomerSegmentation);
// router.get('/customer-retention', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION), analyticsController.getCustomerRetention);
// router.get('/critical-alerts', checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS), analyticsController.getCriticalAlerts);

// // Customer Intelligence (new)
// router.get('/customer-ltv', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV), analyticsController.getCustomerLifetimeValue);
// router.get('/churn-risk', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN), analyticsController.getChurnRiskAnalysis);
// router.get('/market-basket', checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET), analyticsController.getMarketBasketAnalysis);
// router.get('/payment-behavior', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR), analyticsController.getPaymentBehaviorStats);

// // Security / Export
// router.get('/security-audit', checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT), analyticsController.getSecurityAuditLog);
// router.get('/export', checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA), analyticsController.exportAnalyticsData);

// module.exports = router;
