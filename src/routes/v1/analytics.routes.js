const express = require("express");
const router = express.Router();
const analyticsController = require("../../modules/analytics/analyticsController");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// All analytics routes require authentication
router.use(authController.protect);

// ==========================================================================
// 1. EXECUTIVE & COMPARISON (Static High-Level)
// ==========================================================================
router.get("/dashboard", checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), analyticsController.getDashboardOverview);
router.get("/branch-comparison", checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON), analyticsController.getBranchComparison);

// ==========================================================================
// 2. FINANCIAL INTELLIGENCE
// ==========================================================================
router.get("/financials", checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getFinancialDashboard);
router.get("/cash-flow", checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW), analyticsController.getFinancialDashboard);
router.get("/emi-analytics", checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getEMIAnalytics);

// ==========================================================================
// 3. CUSTOMER INTELLIGENCE
// ==========================================================================
router.get("/customer-intelligence", checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION), analyticsController.getCustomerIntelligence);
router.get("/customer-segmentation", checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION), analyticsController.getCustomerSegmentation);
router.get("/customer-ltv", checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV), analyticsController.getCustomerLifetimeValue);
router.get("/churn-risk", checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN), analyticsController.getChurnRiskAnalysis);
router.get("/market-basket", checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET), analyticsController.getMarketBasketAnalysis);
router.get("/payment-behavior", checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR), analyticsController.getPaymentBehaviorStats);
router.get("/customer-insights", checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS), analyticsController.getCustomerInsights);

// ==========================================================================
// 4. INVENTORY & PROCUREMENT
// ==========================================================================
router.get("/inventory-health", checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY), analyticsController.getInventoryHealth);
router.get("/product-performance", checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE), analyticsController.getProductPerformance);
router.get("/dead-stock", checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK), analyticsController.getDeadStockReport);
router.get("/stock-predictions", checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST), analyticsController.getStockOutPredictions);
router.get("/category-performance", checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE), analyticsController.getCategoryAnalytics);
router.get("/supplier-performance", checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT), analyticsController.getSupplierPerformance);
router.get("/procurement", checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT), analyticsController.getProcurementAnalysis);

// ==========================================================================
// 5. OPERATIONAL & STAFF
// ==========================================================================
router.get("/operational-metrics", checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getOperationalMetrics);
router.get("/staff-performance", checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE), analyticsController.getStaffPerformance);
router.get("/staff-attendance-performance", checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE), analyticsController.getStaffAttendancePerformance);
router.get("/peak-hours", checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS), analyticsController.getPeakBusinessHours);
router.get("/time-analytics", checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getTimeBasedAnalytics);

// ==========================================================================
// 6. PREDICTIVE & ALERTS
// ==========================================================================
router.get("/forecast", checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST), analyticsController.getSalesForecast);
router.get("/predictive-analytics", checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST), analyticsController.getPredictiveAnalytics);
router.get("/alerts/realtime", checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS), analyticsController.getRealTimeMonitoring);
router.get("/critical-alerts", checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS), analyticsController.getCriticalAlerts);

// ==========================================================================
// 7. SECURITY, COMPLIANCE & EXPORT
// ==========================================================================
router.get("/security-audit", checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT), analyticsController.getSecurityAuditLog);
router.get("/compliance-dashboard", checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT), analyticsController.getComplianceDashboard);
router.get("/export", checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA), analyticsController.exportAnalyticsData);
router.post("/query", checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA), analyticsController.customAnalyticsQuery);

// ==========================================================================
// 8. INFRASTRUCTURE & HEALTH
// ==========================================================================
router.get("/performance", checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), analyticsController.getAnalyticsPerformance);
router.get("/health/data", checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), analyticsController.getDataHealth);
router.get("/redis-status", checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), analyticsController.getRedisStatus);

module.exports = router;
