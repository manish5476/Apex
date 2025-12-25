const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/analyticsController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// Executive
router.get('/dashboard', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), analyticsController.getDashboardOverview);
router.get('/branch-comparison', checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON), analyticsController.getBranchComparison);

// Financial
router.get('/financials', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getFinancialReport);
router.get('/profitability', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY), analyticsController.getProfitabilityReport);
router.get('/cash-flow', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW), analyticsController.getCashFlowReport);
router.get('/tax-report', checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX), analyticsController.getTaxReport);
router.get('/debtor-aging', checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING), analyticsController.getDebtorAgingReport);

// Operational
router.get('/staff-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE), analyticsController.getStaffPerformance);
router.get('/operational-metrics', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getOperationalMetrics);
router.get('/peak-hours', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS), analyticsController.getPeakBusinessHours);
router.get('/procurement', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT), analyticsController.getProcurementAnalysis);
router.get('/customer-insights', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS), analyticsController.getCustomerInsights);

// Inventory
router.get('/inventory', checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY), analyticsController.getInventoryReport);
router.get('/product-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE), analyticsController.getProductPerformance);
router.get('/dead-stock', checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK), analyticsController.getDeadStockReport);
router.get('/stock-predictions', checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST), analyticsController.getStockOutPredictions);

// Predictive
router.get('/forecast', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST), analyticsController.getSalesForecast);
router.get('/customer-segmentation', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION), analyticsController.getCustomerSegmentation);
router.get('/customer-retention', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION), analyticsController.getCustomerRetention);
router.get('/critical-alerts', checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS), analyticsController.getCriticalAlerts);

// Customer Intelligence (new)
router.get('/customer-ltv', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV), analyticsController.getCustomerLifetimeValue);
router.get('/churn-risk', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN), analyticsController.getChurnRiskAnalysis);
router.get('/market-basket', checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET), analyticsController.getMarketBasketAnalysis);
router.get('/payment-behavior', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR), analyticsController.getPaymentBehaviorStats);

// Security / Export
router.get('/security-audit', checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT), analyticsController.getSecurityAuditLog);
router.get('/export', checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA), analyticsController.exportAnalyticsData);

module.exports = router;


// const express = require('express');
// const router = express.Router();
// const analyticsController = require('../../controllers/analyticsController');
// const authController = require('../../controllers/authController');
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// // 1. EXECUTIVE & STRATEGIC
// router.get('/dashboard', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), analyticsController.getDashboardOverview);
// router.get('/branch-comparison', checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON), analyticsController.getBranchComparison);

// // 2. FINANCIAL INTELLIGENCE
// router.get('/financials', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getFinancialReport);
// router.get('/profitability', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY), analyticsController.getProfitabilityReport);
// router.get('/cash-flow', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW), analyticsController.getCashFlowReport);
// router.get('/tax-report', checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX), analyticsController.getTaxReport);
// router.get('/debtor-aging', checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING), analyticsController.getDebtorAgingReport);

// // 3. OPERATIONAL & STAFF
// router.get('/staff-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE), analyticsController.getStaffPerformance);
// router.get('/operational-metrics', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getOperationalMetrics);
// router.get('/peak-hours', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS), analyticsController.getPeakBusinessHours);
// router.get('/procurement', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT), analyticsController.getProcurementAnalysis);
// router.get('/customer-insights', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS), analyticsController.getCustomerInsights);

// // 4. INVENTORY INTELLIGENCE
// router.get('/inventory', checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY), analyticsController.getInventoryReport);
// router.get('/product-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE), analyticsController.getProductPerformance);
// router.get('/dead-stock', checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK), analyticsController.getDeadStockReport);
// router.get('/stock-predictions', checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST), analyticsController.getStockOutPredictions);

// // 5. PREDICTIVE & ADVANCED
// router.get('/forecast', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST), analyticsController.getSalesForecast);
// router.get('/customer-segmentation', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION), analyticsController.getCustomerSegmentation);
// router.get('/customer-retention', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION), analyticsController.getCustomerRetention);
// router.get('/critical-alerts', checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS), analyticsController.getCriticalAlerts);

// // 6. CUSTOMER INTELLIGENCE (NEW)
// router.get('/customer-ltv', checkPermission(PERMISSIONS.ANALYTICS.READ), analyticsController.getCustomerLifetimeValue);
// router.get('/churn-risk', checkPermission(PERMISSIONS.ANALYTICS.READ), analyticsController.getChurnRiskAnalysis);
// router.get('/market-basket', checkPermission(PERMISSIONS.ANALYTICS.READ), analyticsController.getMarketBasketAnalysis);
// router.get('/payment-behavior', checkPermission(PERMISSIONS.ANALYTICS.READ), analyticsController.getPaymentBehaviorStats);

// // 7. SECURITY & EXPORT
// router.get('/security-audit', checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT), analyticsController.getSecurityAuditLog);
// router.get('/export', checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA), analyticsController.exportAnalyticsData);

// module.exports = router;