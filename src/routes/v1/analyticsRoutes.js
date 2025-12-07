const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/analyticsController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all analytics routes
router.use(authController.protect);
// ==============================================================================
// 1. EXECUTIVE & STRATEGIC
// ==============================================================================
router.get('/dashboard', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), 
    analyticsController.getDashboardOverview
);

router.get('/branch-comparison', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON), // ✅ Updated
    analyticsController.getBranchComparison
);

// ==============================================================================
// 2. FINANCIAL INTELLIGENCE
// ==============================================================================
router.get('/financials', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), 
    analyticsController.getFinancialReport
);

router.get('/profitability', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY), // ✅ Updated
    analyticsController.getProfitabilityReport
);

router.get('/cash-flow', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW), // ✅ Updated
    analyticsController.getCashFlowReport
);

router.get('/debtor-aging', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING), // ✅ Updated
    analyticsController.getDebtorAgingReport
);

router.get('/tax-report', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX), // ✅ Updated
    analyticsController.getTaxReport
);

// ==============================================================================
// 3. OPERATIONAL & STAFF EFFICIENCY
// ==============================================================================
router.get('/staff-performance', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE), // ✅ Updated
    analyticsController.getStaffPerformance
);

router.get('/operational-metrics', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
    analyticsController.getOperationalMetrics
);

router.get('/peak-hours', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS), // ✅ Updated
    analyticsController.getPeakBusinessHours
);

router.get('/procurement', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT), // ✅ Updated
    analyticsController.getProcurementAnalysis
);

router.get('/customer-insights', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS), // ✅ Updated
    analyticsController.getCustomerInsights
);

// ==============================================================================
// 4. INVENTORY INTELLIGENCE
// ==============================================================================
router.get('/inventory', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY), // ✅ Updated
    analyticsController.getInventoryReport
);

router.get('/product-performance', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE), // ✅ Updated
    analyticsController.getProductPerformance
);

router.get('/dead-stock', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK), // ✅ Updated
    analyticsController.getDeadStockReport
);

router.get('/stock-predictions', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST), // ✅ Updated
    analyticsController.getStockOutPredictions
);

// ==============================================================================
// 5. PREDICTIVE & ADVANCED
// ==============================================================================
router.get('/forecast', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST), // ✅ Updated
    analyticsController.getSalesForecast
);

router.get('/customer-segmentation', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION), // ✅ Updated
    analyticsController.getCustomerSegmentation
);

router.get('/customer-retention', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION), // ✅ Updated
    analyticsController.getCustomerRetention
);

router.get('/critical-alerts', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS), // ✅ Updated
    analyticsController.getCriticalAlerts
);

// ==============================================================================
// 6. SECURITY & AUDIT
// ==============================================================================
router.get('/security-audit', 
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT), // ✅ Updated
    analyticsController.getSecurityAuditLog
);

router.get('/export', 
    checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA), 
    analyticsController.exportAnalyticsData
);

module.exports = router;
