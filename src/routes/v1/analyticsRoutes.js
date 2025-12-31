const express = require("express");
const router = express.Router();
const analyticsController = require("../../controllers/analyticsController");
const authController = require("../../controllers/authController");
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

router.get(
    "/dashboard",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
    analyticsController.getDashboardOverview,
);

router.get(
    "/branch-comparison",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON),
    analyticsController.getBranchComparison,
);

// ==========================================================================
// 2. FINANCIAL INTELLIGENCE
// ==========================================================================

// Both endpoints point to the same function
router.get(
    "/financials",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
    analyticsController.getFinancialDashboard,
);

router.get(
    "/profitability",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY),
    analyticsController.getProfitabilityReport,
);

router.get(
    "/cash-flow",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW),
    analyticsController.getCashFlowReport,
);

router.get(
    "/debtor-aging",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING),
    analyticsController.getDebtorAgingReport,
);

router.get(
    "/tax-report",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX),
    analyticsController.getTaxReport,
);

// ==========================================================================
// 3. OPERATIONAL & STAFF EFFICIENCY
// ==========================================================================

router.get(
    "/staff-performance",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
    analyticsController.getStaffPerformance,
);

router.get(
    "/operational-metrics",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getOperationalMetrics,
);

router.get(
    "/peak-hours",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS),
    analyticsController.getPeakBusinessHours,
);

router.get(
    "/procurement",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
    analyticsController.getProcurementAnalysis,
);

router.get(
    "/customer-insights",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS),
    analyticsController.getCustomerInsights,
);

// ==========================================================================
// 4. INVENTORY INTELLIGENCE
// ==========================================================================

// Both endpoints point to the same function
router.get(
    "/inventory",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
    analyticsController.getInventoryReport,
);

router.get(
    "/product-performance",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
    analyticsController.getProductPerformance,
);

router.get(
    "/dead-stock",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK),
    analyticsController.getDeadStockReport,
);

router.get(
    "/stock-predictions",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST),
    analyticsController.getStockOutPredictions,
);

// ==========================================================================
// 5. PREDICTIVE & ADVANCED
// ==========================================================================

// Both endpoints point to the same function
router.get(
    "/forecast",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
    analyticsController.getSalesForecast,
);

router.get(
    "/customer-segmentation",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
    analyticsController.getCustomerSegmentation,
);

router.get(
    "/customer-retention",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION),
    analyticsController.getCustomerRetention,
);

router.get(
    "/critical-alerts",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
    analyticsController.getCriticalAlerts,
);

// ==========================================================================
// 6. CUSTOMER 360 INTELLIGENCE
// ==========================================================================

router.get(
    "/customer-ltv",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV),
    analyticsController.getCustomerLifetimeValue,
);

router.get(
    "/churn-risk",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN),
    analyticsController.getChurnRiskAnalysis,
);

router.get(
    "/market-basket",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET),
    analyticsController.getMarketBasketAnalysis,
);

router.get(
    "/payment-behavior",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR),
    analyticsController.getPaymentBehaviorStats,
);

// ==========================================================================
// 7. SECURITY & EXPORT
// ==========================================================================

router.get(
    "/security-audit",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
    analyticsController.getSecurityAuditLog,
);

router.get(
    "/export",
    checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
    analyticsController.exportAnalyticsData,
);

// ==========================================================================
// 8. ADVANCED ENDPOINTS (Optional - can be enabled later)
// ==========================================================================

// Optional endpoints - comment out if not needed yet
router.get(
    "/customer-intelligence",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
    analyticsController.getCustomerIntelligence,
);

router.get(
    "/inventory-health",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
    analyticsController.getInventoryHealth,
);

router.get(
    "/alerts/realtime",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
    analyticsController.getSystemAlerts,
);

router.post(
    "/query",
    checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
    analyticsController.customQuery,
);

router.get(
    "/performance",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
    analyticsController.getAnalyticsPerformance,
);

router.get(
    "/health/data",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
    analyticsController.getDataHealth,
);

module.exports = router;
// const express = require('express');
// const router = express.Router();
// const analyticsController = require('../../controllers/analyticsController');
// const authController = require('../../controllers/authController');
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// // All analytics routes require authentication
// router.use(authController.protect);

// /**
//  * UTILITY: Common Query Parameters
//  * Most endpoints accept the following optional query params:
//  * - startDate (YYYY-MM-DD): Filter start date (defaults to start of current month)
//  * - endDate (YYYY-MM-DD): Filter end date (defaults to end of current day)
//  * - branchId (ObjectId): Filter by specific branch (defaults to all branches in org)
//  * - cache (boolean): Enable/disable caching (default: true)
//  */

// // ==========================================================================
// // 1. SMART EXECUTIVE DASHBOARDS
// // ==========================================================================

// /**
//  * @route GET /api/v1/analytics/dashboard
//  * @desc Get executive dashboard with all key metrics, charts, and insights
//  * @access Analytics - View Executive
//  * @params startDate, endDate, branchId, cache
//  */
// router.get(
//     '/dashboard',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
//     analyticsController.getDashboardOverview
// );

// /**
//  * @route GET /api/v1/analytics/branch-comparison
//  * @desc Compare performance across all branches
//  * @access Analytics - View Branch Comparison
//  * @params startDate, endDate, groupBy (revenue|efficiency), limit
//  */
// router.get(
//     '/branch-comparison',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON),
//     analyticsController.getBranchComparison
// );

// // ==========================================================================
// // 2. ENHANCED FINANCIAL INTELLIGENCE
// // ==========================================================================

// /**
//  * @route GET /api/v1/analytics/financials
//  * @desc Comprehensive financial dashboard with trends and recommendations
//  * @access Analytics - View Financial
//  * @params startDate, endDate, branchId, interval (auto|day|week|month|year), metrics (all|revenue|expenses|profit)
//  */
// router.get(
//     '/financials',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
//     analyticsController.getFinancialDashboard
// );

// /**
//  * @route GET /api/v1/analytics/cash-flow
//  * @desc Detailed cash flow analysis with projections
//  * @access Analytics - View Cashflow
//  * @params startDate, endDate, branchId, projectionDays
//  */
// router.get(
//     '/cash-flow',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW),
//     analyticsController.getCashFlowReport
// );

// /**
//  * @route GET /api/v1/analytics/profitability
//  * @desc Gross profit analysis with margin breakdown
//  * @access Analytics - View Profitability
//  * @params startDate, endDate, branchId
//  */
// router.get(
//     '/profitability',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY),
//     analyticsController.getProfitabilityReport
// );

// /**
//  * @route GET /api/v1/analytics/tax-report
//  * @desc Tax liability and compliance analysis
//  * @access Analytics - View Tax
//  * @params startDate, endDate, branchId
//  */
// router.get(
//     '/tax-report',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX),
//     analyticsController.getTaxReport
// );

// /**
//  * @route GET /api/v1/analytics/debtor-aging
//  * @desc Aging analysis of accounts receivable
//  * @access Analytics - View Debtor Aging
//  * @params branchId
//  */
// router.get(
//     '/debtor-aging',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING),
//     analyticsController.getDebtorAgingReport
// );

// // ==========================================================================
// // 3. ADVANCED OPERATIONAL INTELLIGENCE
// // ==========================================================================

// /**
//  * @route GET /api/v1/analytics/staff-performance
//  * @desc Staff productivity and performance metrics
//  * @access Analytics - View Staff Performance
//  * @params startDate, endDate, branchId, minSales, sortBy (revenue|productivity|orders)
//  */
// router.get(
//     '/staff-performance',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
//     analyticsController.getStaffPerformance
// );

// /**
//  * @route GET /api/v1/analytics/operational-metrics
//  * @desc Comprehensive operational efficiency dashboard
//  * @access Analytics - View Operational
//  * @params startDate, endDate, branchId, includeDetails
//  */
// router.get(
//     '/operational-metrics',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
//     analyticsController.getOperationalMetrics
// );

// /**
//  * @route GET /api/v1/analytics/peak-hours
//  * @desc Business hour heatmap and staffing recommendations
//  * @access Analytics - View Peak Hours
//  * @params branchId
//  */
// router.get(
//     '/peak-hours',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS),
//     analyticsController.getPeakBusinessHours
// );

// /**
//  * @route GET /api/v1/analytics/procurement
//  * @desc Supplier analysis and procurement optimization
//  * @access Analytics - View Procurement
//  * @params startDate, endDate, branchId
//  */
// router.get(
//     '/procurement',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
//     analyticsController.getProcurementAnalysis
// );

// // ==========================================================================
// // 4. INTELLIGENT INVENTORY MANAGEMENT
// // ==========================================================================

// /**
//  * @route GET /api/v1/analytics/inventory/health
//  * @desc Complete inventory health dashboard with alerts and recommendations
//  * @access Analytics - View Inventory
//  * @params branchId, includeValuation, includePredictions
//  */
// router.get(
//     '/inventory/health',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
//     analyticsController.getInventoryHealth
// );

// /**
//  * @route GET /api/v1/analytics/inventory/performance
//  * @desc Product performance by revenue, margin, and volume
//  * @access Analytics - View Product Performance
//  * @params branchId, period (7d|30d|90d|365d)
//  */
// router.get(
//     '/inventory/performance',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
//     analyticsController.getProductPerformance
// );

// /**
//  * @route GET /api/v1/analytics/inventory/dead-stock
//  * @desc Identify slow-moving and non-moving inventory
//  * @access Analytics - View Dead Stock
//  * @params branchId, daysThreshold
//  */
// router.get(
//     '/inventory/dead-stock',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK),
//     analyticsController.getDeadStockReport
// );

// /**
//  * @route GET /api/v1/analytics/inventory/predictions
//  * @desc Stock-out predictions and replenishment recommendations
//  * @access Analytics - View Stock Forecast
//  * @params branchId
//  */
// router.get(
//     '/inventory/predictions',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST),
//     analyticsController.getStockOutPredictions
// );

// // ==========================================================================
// // 5. PREDICTIVE ANALYTICS & FORECASTING
// // ==========================================================================

// /**
//  * @route GET /api/v1/analytics/forecast/sales
//  * @desc AI-powered sales forecasting with confidence intervals
//  * @access Analytics - View Forecast
//  * @params branchId, periods, confidence
//  */
// router.get(
//     '/forecast/sales',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
//     analyticsController.getSalesForecast
// );

// /**
//  * @route GET /api/v1/analytics/customers/intelligence
//  * @desc Complete customer intelligence hub with segmentation and LTV
//  * @access Analytics - View Customer Segmentation
//  * @params branchId, includeSegments, includeChurn
//  */
// router.get(
//     '/customers/intelligence',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
//     analyticsController.getCustomerIntelligence
// );

// /**
//  * @route GET /api/v1/analytics/customers/retention
//  * @desc Cohort analysis and retention metrics
//  * @access Analytics - View Customer Retention
//  * @params months
//  */
// router.get(
//     '/customers/retention',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION),
//     analyticsController.getCustomerRetention
// );

// /**
//  * @route GET /api/v1/analytics/customers/insights
//  * @desc Customer risk analysis and credit insights
//  * @access Analytics - View Customer Insights
//  * @params branchId
//  */
// router.get(
//     '/customers/insights',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS),
//     analyticsController.getCustomerInsights
// );

// // ==========================================================================
// // 6. ADVANCED CUSTOMER INTELLIGENCE
// // ==========================================================================

// /**
//  * @route GET /api/v1/analytics/customers/ltv
//  * @desc Customer Lifetime Value calculation and ranking
//  * @access Analytics - View Customer LTV
//  * @params branchId
//  */
// router.get(
//     '/customers/ltv',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV),
//     analyticsController.getCustomerLifetimeValue
// );

// /**
//  * @route GET /api/v1/analytics/customers/churn-risk
//  * @desc Predictive churn risk analysis
//  * @access Analytics - View Churn
//  * @params daysThreshold
//  */
// router.get(
//     '/customers/churn-risk',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN),
//     analyticsController.getChurnRiskAnalysis
// );

// /**
//  * @route GET /api/v1/analytics/customers/market-basket
//  * @desc Market basket analysis for cross-selling opportunities
//  * @access Analytics - View Market Basket
//  * @params minSupport
//  */
// router.get(
//     '/customers/market-basket',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET),
//     analyticsController.getMarketBasketAnalysis
// );

// /**
//  * @route GET /api/v1/analytics/customers/payment-behavior
//  * @desc Customer payment habits and credit risk assessment
//  * @access Analytics - View Payment Behavior
//  * @params branchId
//  */
// router.get(
//     '/customers/payment-behavior',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR),
//     analyticsController.getPaymentBehaviorStats
// );

// // ==========================================================================
// // 7. REAL-TIME MONITORING & ALERTS
// // ==========================================================================

// /**
//  * @route GET /api/v1/analytics/alerts/realtime
//  * @desc Real-time system alerts and notifications
//  * @access Analytics - View Alerts
//  * @params branchId, severity (critical|warning|info), limit
//  */
// router.get(
//     '/alerts/realtime',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
//     analyticsController.getSystemAlerts
// );

// /**
//  * @route GET /api/v1/analytics/alerts/critical
//  * @desc Critical alerts summary across all departments
//  * @access Analytics - View Alerts
//  * @params branchId
//  */
// router.get(
//     '/alerts/critical',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
//     analyticsController.getCriticalAlerts
// );

// /**
//  * @route GET /api/v1/analytics/security/audit
//  * @desc Security audit logs and risk assessment
//  * @access Analytics - View Security Audit
//  * @params startDate, endDate
//  */
// router.get(
//     '/security/audit',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
//     analyticsController.getSecurityAuditLog
// );

// // ==========================================================================
// // 8. ADVANCED EXPORT & DATA MANAGEMENT
// // ==========================================================================

// /**
//  * @route GET /api/v1/analytics/export
//  * @desc Export analytics data in multiple formats
//  * @access Analytics - Export Data
//  * @params type (sales|inventory|customers|financial), format (csv|excel|pdf|json), compression, columns
//  */
// router.get(
//     '/export',
//     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
//     analyticsController.exportAnalyticsData
// );

// /**
//  * @route POST /api/v1/analytics/query
//  * @desc Custom analytics query builder (for advanced users)
//  * @access Analytics - Export Data
//  * @body {query: string, parameters: object, limit: number}
//  */
// router.post(
//     '/query',
//     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
//     analyticsController.customQuery
// );

// // ==========================================================================
// // 9. SYSTEM PERFORMANCE & HEALTH
// // ==========================================================================

// /**
//  * @route GET /api/v1/analytics/performance
//  * @desc Analytics system performance metrics
//  * @access Analytics - View Executive
//  * @params hours (default: 24)
//  */
// router.get(
//     '/performance',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
//     analyticsController.getAnalyticsPerformance
// );

// /**
//  * @route GET /api/v1/analytics/health/data
//  * @desc Data integrity and health check
//  * @access Analytics - View Executive
//  * @params none
//  */
// router.get(
//     '/health/data',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
//     analyticsController.getDataHealth
// );

// // ==========================================================================
// // 10. LEGACY ENDPOINTS (For backward compatibility)
// // ==========================================================================

// /**
//  * @route GET /api/v1/analytics/inventory
//  * @desc Legacy inventory endpoint - redirects to /inventory/health
//  * @access Analytics - View Inventory
//  * @params branchId
//  */
// router.get(
//     '/inventory',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
//     analyticsController.getInventoryReport
// );

// /**
//  * @route GET /api/v1/analytics/product-performance
//  * @desc Legacy product performance endpoint
//  * @access Analytics - View Product Performance
//  * @params branchId
//  */
// router.get(
//     '/product-performance',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
//     analyticsController.getProductPerformance
// );

// /**
//  * @route GET /api/v1/analytics/forecast
//  * @desc Legacy forecast endpoint
//  * @access Analytics - View Forecast
//  * @params branchId
//  */
// router.get(
//     '/forecast',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
//     analyticsController.getSalesForecast
// );

// /**
//  * @route GET /api/v1/analytics/customer-segmentation
//  * @desc Legacy customer segmentation endpoint
//  * @access Analytics - View Customer Segmentation
//  * @params none
//  */
// router.get(
//     '/customer-segmentation',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
//     analyticsController.getCustomerSegmentation
// );

// module.exports = router;

// // const express = require('express');
// // const router = express.Router();
// // const analyticsController = require('../../controllers/analyticsController');
// // const authController = require('../../controllers/authController');
// // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // const { PERMISSIONS } = require("../../config/permissions");

// // // All analytics routes require authentication
// // router.use(authController.protect);

// // /**
// //  * UTILITY: Common Query Parameters
// //  * Most endpoints accept the following optional query params:
// //  * - startDate (YYYY-MM-DD): Filter start date (defaults to start of current month)
// //  * - endDate (YYYY-MM-DD): Filter end date (defaults to end of current day)
// //  * - branchId (ObjectId): Filter by specific branch (defaults to all branches in org)
// //  * - cache (boolean): Enable/disable caching (default: true)
// //  */

// // // ==========================================================================
// // // 1. SMART EXECUTIVE DASHBOARDS
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/dashboard
// //  * @desc Get executive dashboard with all key metrics, charts, and insights
// //  * @access Analytics - View Executive
// //  * @params startDate, endDate, branchId, cache
// //  */
// // router.get(
// //     '/dashboard',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// //     analyticsController.getDashboardOverview
// // );

// // /**
// //  * @route GET /api/v1/analytics/branch-comparison
// //  * @desc Compare performance across all branches
// //  * @access Analytics - View Branch Comparison
// //  * @params startDate, endDate, groupBy (revenue|efficiency), limit
// //  */
// // router.get(
// //     '/branch-comparison',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON),
// //     analyticsController.getBranchComparison
// // );

// // // ==========================================================================
// // // 2. ENHANCED FINANCIAL INTELLIGENCE
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/financials
// //  * @desc Comprehensive financial dashboard with trends and recommendations
// //  * @access Analytics - View Financial
// //  * @params startDate, endDate, branchId, interval (auto|day|week|month|year), metrics (all|revenue|expenses|profit)
// //  */
// // router.get(
// //     '/financials',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
// //     analyticsController.getFinancialDashboard
// // );

// // /**
// //  * @route GET /api/v1/analytics/cash-flow
// //  * @desc Detailed cash flow analysis with projections
// //  * @access Analytics - View Cashflow
// //  * @params startDate, endDate, branchId, projectionDays
// //  */
// // router.get(
// //     '/cash-flow',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW),
// //     analyticsController.getCashFlowReport
// // );

// // /**
// //  * @route GET /api/v1/analytics/profitability
// //  * @desc Gross profit analysis with margin breakdown
// //  * @access Analytics - View Profitability
// //  * @params startDate, endDate, branchId
// //  */
// // router.get(
// //     '/profitability',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY),
// //     analyticsController.getProfitabilityReport
// // );

// // /**
// //  * @route GET /api/v1/analytics/tax-report
// //  * @desc Tax liability and compliance analysis
// //  * @access Analytics - View Tax
// //  * @params startDate, endDate, branchId
// //  */
// // router.get(
// //     '/tax-report',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX),
// //     analyticsController.getTaxReport
// // );

// // /**
// //  * @route GET /api/v1/analytics/debtor-aging
// //  * @desc Aging analysis of accounts receivable
// //  * @access Analytics - View Debtor Aging
// //  * @params branchId
// //  */
// // router.get(
// //     '/debtor-aging',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING),
// //     analyticsController.getDebtorAgingReport
// // );

// // // ==========================================================================
// // // 3. ADVANCED OPERATIONAL INTELLIGENCE
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/staff-performance
// //  * @desc Staff productivity and performance metrics
// //  * @access Analytics - View Staff Performance
// //  * @params startDate, endDate, branchId, minSales, sortBy (revenue|productivity|orders)
// //  */
// // router.get(
// //     '/staff-performance',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
// //     analyticsController.getStaffPerformance
// // );

// // /**
// //  * @route GET /api/v1/analytics/operational-metrics
// //  * @desc Comprehensive operational efficiency dashboard
// //  * @access Analytics - View Operational
// //  * @params startDate, endDate, branchId, includeDetails
// //  */
// // router.get(
// //     '/operational-metrics',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
// //     analyticsController.getOperationalMetrics
// // );

// // /**
// //  * @route GET /api/v1/analytics/peak-hours
// //  * @desc Business hour heatmap and staffing recommendations
// //  * @access Analytics - View Peak Hours
// //  * @params branchId
// //  */
// // router.get(
// //     '/peak-hours',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS),
// //     analyticsController.getPeakBusinessHours
// // );

// // /**
// //  * @route GET /api/v1/analytics/procurement
// //  * @desc Supplier analysis and procurement optimization
// //  * @access Analytics - View Procurement
// //  * @params startDate, endDate, branchId
// //  */
// // router.get(
// //     '/procurement',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
// //     analyticsController.getProcurementAnalysis
// // );

// // // ==========================================================================
// // // 4. INTELLIGENT INVENTORY MANAGEMENT
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/inventory/health
// //  * @desc Complete inventory health dashboard with alerts and recommendations
// //  * @access Analytics - View Inventory
// //  * @params branchId, includeValuation, includePredictions
// //  */
// // router.get(
// //     '/inventory/health',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// //     analyticsController.getInventoryHealth
// // );

// // /**
// //  * @route GET /api/v1/analytics/inventory/performance
// //  * @desc Product performance by revenue, margin, and volume
// //  * @access Analytics - View Product Performance
// //  * @params branchId, period (7d|30d|90d|365d)
// //  */
// // router.get(
// //     '/inventory/performance',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// //     analyticsController.getProductPerformance
// // );

// // /**
// //  * @route GET /api/v1/analytics/inventory/dead-stock
// //  * @desc Identify slow-moving and non-moving inventory
// //  * @access Analytics - View Dead Stock
// //  * @params branchId, daysThreshold
// //  */
// // router.get(
// //     '/inventory/dead-stock',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK),
// //     analyticsController.getDeadStockReport
// // );

// // /**
// //  * @route GET /api/v1/analytics/inventory/predictions
// //  * @desc Stock-out predictions and replenishment recommendations
// //  * @access Analytics - View Stock Forecast
// //  * @params branchId
// //  */
// // router.get(
// //     '/inventory/predictions',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST),
// //     analyticsController.getStockOutPredictions
// // );

// // // ==========================================================================
// // // 5. PREDICTIVE ANALYTICS & FORECASTING
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/forecast/sales
// //  * @desc AI-powered sales forecasting with confidence intervals
// //  * @access Analytics - View Forecast
// //  * @params branchId, periods, confidence
// //  */
// // router.get(
// //     '/forecast/sales',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
// //     analyticsController.getSalesForecast
// // );

// // /**
// //  * @route GET /api/v1/analytics/customers/intelligence
// //  * @desc Complete customer intelligence hub with segmentation and LTV
// //  * @access Analytics - View Customer Segmentation
// //  * @params branchId, includeSegments, includeChurn
// //  */
// // router.get(
// //     '/customers/intelligence',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// //     analyticsController.getCustomerIntelligence
// // );

// // /**
// //  * @route GET /api/v1/analytics/customers/retention
// //  * @desc Cohort analysis and retention metrics
// //  * @access Analytics - View Customer Retention
// //  * @params months
// //  */
// // router.get(
// //     '/customers/retention',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION),
// //     analyticsController.getCustomerRetention
// // );

// // /**
// //  * @route GET /api/v1/analytics/customers/insights
// //  * @desc Customer risk analysis and credit insights
// //  * @access Analytics - View Customer Insights
// //  * @params branchId
// //  */
// // router.get(
// //     '/customers/insights',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS),
// //     analyticsController.getCustomerInsights
// // );

// // // ==========================================================================
// // // 6. ADVANCED CUSTOMER INTELLIGENCE
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/customers/ltv
// //  * @desc Customer Lifetime Value calculation and ranking
// //  * @access Analytics - View Customer LTV
// //  * @params branchId
// //  */
// // router.get(
// //     '/customers/ltv',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV),
// //     analyticsController.getCustomerLifetimeValue
// // );

// // /**
// //  * @route GET /api/v1/analytics/customers/churn-risk
// //  * @desc Predictive churn risk analysis
// //  * @access Analytics - View Churn
// //  * @params daysThreshold
// //  */
// // router.get(
// //     '/customers/churn-risk',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN),
// //     analyticsController.getChurnRiskAnalysis
// // );

// // /**
// //  * @route GET /api/v1/analytics/customers/market-basket
// //  * @desc Market basket analysis for cross-selling opportunities
// //  * @access Analytics - View Market Basket
// //  * @params minSupport
// //  */
// // router.get(
// //     '/customers/market-basket',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET),
// //     analyticsController.getMarketBasketAnalysis
// // );

// // /**
// //  * @route GET /api/v1/analytics/customers/payment-behavior
// //  * @desc Customer payment habits and credit risk assessment
// //  * @access Analytics - View Payment Behavior
// //  * @params branchId
// //  */
// // router.get(
// //     '/customers/payment-behavior',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR),
// //     analyticsController.getPaymentBehaviorStats
// // );

// // // ==========================================================================
// // // 7. REAL-TIME MONITORING & ALERTS
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/alerts/realtime
// //  * @desc Real-time system alerts and notifications
// //  * @access Analytics - View Alerts
// //  * @params branchId, severity (critical|warning|info), limit
// //  */
// // router.get(
// //     '/alerts/realtime',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// //     analyticsController.getSystemAlerts
// // );

// // /**
// //  * @route GET /api/v1/analytics/alerts/critical
// //  * @desc Critical alerts summary across all departments
// //  * @access Analytics - View Alerts
// //  * @params branchId
// //  */
// // router.get(
// //     '/alerts/critical',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// //     analyticsController.getCriticalAlerts
// // );

// // /**
// //  * @route GET /api/v1/analytics/security/audit
// //  * @desc Security audit logs and risk assessment
// //  * @access Analytics - View Security Audit
// //  * @params startDate, endDate
// //  */
// // router.get(
// //     '/security/audit',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
// //     analyticsController.getSecurityAuditLog
// // );

// // // ==========================================================================
// // // 8. ADVANCED EXPORT & DATA MANAGEMENT
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/export
// //  * @desc Export analytics data in multiple formats
// //  * @access Analytics - Export Data
// //  * @params type (sales|inventory|customers|financial), format (csv|excel|pdf|json), compression, columns
// //  */
// // router.get(
// //     '/export',
// //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// //     analyticsController.exportAnalyticsData
// // );

// // /**
// //  * @route POST /api/v1/analytics/query
// //  * @desc Custom analytics query builder (for advanced users)
// //  * @access Analytics - Export Data
// //  * @body {query: string, parameters: object, limit: number}
// //  */
// // router.post(
// //     '/query',
// //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// //     analyticsController.customQuery
// // );

// // // ==========================================================================
// // // 9. SYSTEM PERFORMANCE & HEALTH
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/performance
// //  * @desc Analytics system performance metrics
// //  * @access Analytics - View Executive
// //  * @params hours (default: 24)
// //  */
// // router.get(
// //     '/performance',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// //     analyticsController.getAnalyticsPerformance
// // );

// // /**
// //  * @route GET /api/v1/analytics/health/data
// //  * @desc Data integrity and health check
// //  * @access Analytics - View Executive
// //  * @params none
// //  */
// // router.get(
// //     '/health/data',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// //     analyticsController.getDataHealth
// // );

// // // ==========================================================================
// // // 10. LEGACY ENDPOINTS (For backward compatibility)
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/inventory
// //  * @desc Legacy inventory endpoint - redirects to /inventory/health
// //  * @access Analytics - View Inventory
// //  * @params branchId
// //  */
// // router.get(
// //     '/inventory',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// //     analyticsController.getInventoryReport
// // );

// // /**
// //  * @route GET /api/v1/analytics/product-performance
// //  * @desc Legacy product performance endpoint
// //  * @access Analytics - View Product Performance
// //  * @params branchId
// //  */
// // router.get(
// //     '/product-performance',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// //     analyticsController.getProductPerformance
// // );

// // /**
// //  * @route GET /api/v1/analytics/forecast
// //  * @desc Legacy forecast endpoint
// //  * @access Analytics - View Forecast
// //  * @params branchId
// //  */
// // router.get(
// //     '/forecast',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
// //     analyticsController.getSalesForecast
// // );

// // /**
// //  * @route GET /api/v1/analytics/customer-segmentation
// //  * @desc Legacy customer segmentation endpoint
// //  * @access Analytics - View Customer Segmentation
// //  * @params none
// //  */
// // router.get(
// //     '/customer-segmentation',
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// //     analyticsController.getCustomerSegmentation
// // );

// // module.exports = router;
// // // const express = require('express');
// // // const router = express.Router();
// // // const analyticsController = require('../../controllers/analyticsController');
// // // const authController = require('../../controllers/authController');
// // // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // // const { PERMISSIONS } = require("../../config/permissions");

// // // // All analytics routes require authentication
// // // router.use(authController.protect);

// // // /**
// // //  * UTILITY: Common Query Parameters
// // //  * Most endpoints accept the following optional query params:
// // //  * - startDate (YYYY-MM-DD): Filter start date (defaults to start of current month)
// // //  * - endDate (YYYY-MM-DD): Filter end date (defaults to end of current day)
// // //  * - branchId (ObjectId): Filter by specific branch (defaults to all branches in org)
// // //  */

// // // // ==========================================================================
// // // // 1. EXECUTIVE & STRATEGIC
// // // // ==========================================================================

// // // // GET /api/v1/analytics/dashboard
// // // // Params: startDate, endDate, branchId
// // // router.get(
// // //     '/dashboard',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// // //     analyticsController.getDashboardOverview
// // // );

// // // // GET /api/v1/analytics/branch-comparison
// // // // Params: startDate, endDate
// // // router.get(
// // //     '/branch-comparison',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON),
// // //     analyticsController.getBranchComparison
// // // );

// // // // ==========================================================================
// // // // 2. FINANCIAL
// // // // ==========================================================================

// // // // GET /api/v1/analytics/financials
// // // // Params: startDate, endDate, branchId, interval ('day' | 'month' | 'year')
// // // router.get(
// // //     '/financials',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
// // //     analyticsController.getFinancialReport
// // // );

// // // // GET /api/v1/analytics/profitability
// // // // Params: startDate, endDate, branchId
// // // router.get(
// // //     '/profitability',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY),
// // //     analyticsController.getProfitabilityReport
// // // );

// // // // GET /api/v1/analytics/cash-flow
// // // // Params: startDate, endDate, branchId
// // // router.get(
// // //     '/cash-flow',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW),
// // //     analyticsController.getCashFlowReport
// // // );

// // // // GET /api/v1/analytics/tax-report
// // // // Params: startDate, endDate, branchId
// // // router.get(
// // //     '/tax-report',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX),
// // //     analyticsController.getTaxReport
// // // );

// // // // GET /api/v1/analytics/debtor-aging
// // // // Params: branchId
// // // router.get(
// // //     '/debtor-aging',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING),
// // //     analyticsController.getDebtorAgingReport
// // // );

// // // // ==========================================================================
// // // // 3. OPERATIONAL
// // // // ==========================================================================

// // // // GET /api/v1/analytics/staff-performance
// // // // Params: startDate, endDate, branchId
// // // router.get(
// // //     '/staff-performance',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
// // //     analyticsController.getStaffPerformance
// // // );

// // // // GET /api/v1/analytics/operational-metrics
// // // // Params: startDate, endDate, branchId
// // // router.get(
// // //     '/operational-metrics',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
// // //     analyticsController.getOperationalMetrics
// // // );

// // // // GET /api/v1/analytics/peak-hours
// // // // Params: branchId (Analyzes last 30 days by default)
// // // router.get(
// // //     '/peak-hours',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS),
// // //     analyticsController.getPeakBusinessHours
// // // );

// // // // GET /api/v1/analytics/procurement
// // // // Params: startDate, endDate, branchId
// // // router.get(
// // //     '/procurement',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
// // //     analyticsController.getProcurementAnalysis
// // // );

// // // // GET /api/v1/analytics/customer-insights
// // // // Params: branchId
// // // router.get(
// // //     '/customer-insights',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS),
// // //     analyticsController.getCustomerInsights
// // // );

// // // // ==========================================================================
// // // // 4. INVENTORY
// // // // ==========================================================================

// // // // GET /api/v1/analytics/inventory
// // // // Params: branchId
// // // router.get(
// // //     '/inventory',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// // //     analyticsController.getInventoryReport
// // // );

// // // // GET /api/v1/analytics/product-performance
// // // // Params: branchId
// // // router.get(
// // //     '/product-performance',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// // //     analyticsController.getProductPerformance
// // // );

// // // // GET /api/v1/analytics/dead-stock
// // // // Params: branchId, daysThreshold (number, default: 90)
// // // router.get(
// // //     '/dead-stock',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK),
// // //     analyticsController.getDeadStockReport
// // // );

// // // // GET /api/v1/analytics/stock-predictions
// // // // Params: branchId
// // // router.get(
// // //     '/stock-predictions',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST),
// // //     analyticsController.getStockOutPredictions
// // // );

// // // // ==========================================================================
// // // // 5. PREDICTIVE
// // // // ==========================================================================

// // // // GET /api/v1/analytics/forecast
// // // // Params: branchId
// // // router.get(
// // //     '/forecast',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
// // //     analyticsController.getSalesForecast
// // // );

// // // // GET /api/v1/analytics/customer-segmentation
// // // // Params: None (Analyzes full customer base)
// // // router.get(
// // //     '/customer-segmentation',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// // //     analyticsController.getCustomerSegmentation
// // // );

// // // // GET /api/v1/analytics/customer-retention
// // // // Params: months (number, default: 6)
// // // router.get(
// // //     '/customer-retention',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION),
// // //     analyticsController.getCustomerRetention
// // // );

// // // // GET /api/v1/analytics/critical-alerts
// // // // Params: branchId
// // // router.get(
// // //     '/critical-alerts',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// // //     analyticsController.getCriticalAlerts
// // // );

// // // // ==========================================================================
// // // // 6. CUSTOMER INTELLIGENCE (NEW)
// // // // ==========================================================================

// // // // GET /api/v1/analytics/customer-ltv
// // // // Params: branchId
// // // router.get(
// // //     '/customer-ltv',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV),
// // //     analyticsController.getCustomerLifetimeValue
// // // );

// // // // GET /api/v1/analytics/churn-risk
// // // // Params: daysThreshold (number, default: 90)
// // // router.get(
// // //     '/churn-risk',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN),
// // //     analyticsController.getChurnRiskAnalysis
// // // );

// // // // GET /api/v1/analytics/market-basket
// // // // Params: minSupport (number, default: 2)
// // // router.get(
// // //     '/market-basket',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET),
// // //     analyticsController.getMarketBasketAnalysis
// // // );

// // // // GET /api/v1/analytics/payment-behavior
// // // // Params: branchId
// // // router.get(
// // //     '/payment-behavior',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR),
// // //     analyticsController.getPaymentBehaviorStats
// // // );

// // // // ==========================================================================
// // // // 7. SECURITY / EXPORT
// // // // ==========================================================================

// // // // GET /api/v1/analytics/security-audit
// // // // Params: startDate, endDate
// // // router.get(
// // //     '/security-audit',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
// // //     analyticsController.getSecurityAuditLog
// // // );

// // // // GET /api/v1/analytics/export
// // // // Params: startDate, endDate, type ('sales'|'inventory'|'tax'), format ('csv'|'json', default: 'csv')
// // // router.get(
// // //     '/export',
// // //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// // //     analyticsController.exportAnalyticsData
// // // );

// // // module.exports = router;

// // // // const express = require('express');
// // // // const router = express.Router();
// // // // const analyticsController = require('../../controllers/analyticsController');
// // // // const authController = require('../../controllers/authController');
// // // // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // // // const { PERMISSIONS } = require("../../config/permissions");

// // // // router.use(authController.protect);

// // // // // Executive
// // // // router.get('/dashboard', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), analyticsController.getDashboardOverview);
// // // // router.get('/branch-comparison', checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON), analyticsController.getBranchComparison);

// // // // // Financial
// // // // router.get('/financials', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getFinancialReport);
// // // // router.get('/profitability', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY), analyticsController.getProfitabilityReport);
// // // // router.get('/cash-flow', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW), analyticsController.getCashFlowReport);
// // // // router.get('/tax-report', checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX), analyticsController.getTaxReport);
// // // // router.get('/debtor-aging', checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING), analyticsController.getDebtorAgingReport);

// // // // // Operational
// // // // router.get('/staff-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE), analyticsController.getStaffPerformance);
// // // // router.get('/operational-metrics', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getOperationalMetrics);
// // // // router.get('/peak-hours', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS), analyticsController.getPeakBusinessHours);
// // // // router.get('/procurement', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT), analyticsController.getProcurementAnalysis);
// // // // router.get('/customer-insights', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS), analyticsController.getCustomerInsights);

// // // // // Inventory
// // // // router.get('/inventory', checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY), analyticsController.getInventoryReport);
// // // // router.get('/product-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE), analyticsController.getProductPerformance);
// // // // router.get('/dead-stock', checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK), analyticsController.getDeadStockReport);
// // // // router.get('/stock-predictions', checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST), analyticsController.getStockOutPredictions);

// // // // // Predictive
// // // // router.get('/forecast', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST), analyticsController.getSalesForecast);
// // // // router.get('/customer-segmentation', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION), analyticsController.getCustomerSegmentation);
// // // // router.get('/customer-retention', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION), analyticsController.getCustomerRetention);
// // // // router.get('/critical-alerts', checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS), analyticsController.getCriticalAlerts);

// // // // // Customer Intelligence (new)
// // // // router.get('/customer-ltv', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV), analyticsController.getCustomerLifetimeValue);
// // // // router.get('/churn-risk', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN), analyticsController.getChurnRiskAnalysis);
// // // // router.get('/market-basket', checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET), analyticsController.getMarketBasketAnalysis);
// // // // router.get('/payment-behavior', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR), analyticsController.getPaymentBehaviorStats);

// // // // // Security / Export
// // // // router.get('/security-audit', checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT), analyticsController.getSecurityAuditLog);
// // // // router.get('/export', checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA), analyticsController.exportAnalyticsData);

// // // // module.exports = router;
