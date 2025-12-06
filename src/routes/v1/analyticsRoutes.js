const express = require('express');
const router = express.Router();

const analyticsController = require('../../controllers/analyticsController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect ALL routes
router.use(authController.protect);


/* ==========================================================================
   1. EXECUTIVE & STRATEGY
   ========================================================================== */
router.get(
    '/dashboard',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
    analyticsController.getDashboardOverview
);


/* ==========================================================================
   2. FINANCIAL ANALYTICS
   ========================================================================== */

router.get(
    '/financials',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
    analyticsController.getFinancialOverview
);

router.get(
    '/cashflow',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
    analyticsController.getCashFlow
);

router.get(
    '/tax',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
    analyticsController.getTaxReport
);


/* ==========================================================================
   3. INVENTORY & PRODUCT ANALYTICS
   ========================================================================== */

router.get(
    '/inventory',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getInventory
);

router.get(
    '/product-performance',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getProductPerformance
);

router.get(
    '/dead-stock',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getDeadStock
);

router.get(
    '/stock-forecast',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getStockOutPredictions
);


/* ==========================================================================
   4. PROCUREMENT
   ========================================================================== */
router.get(
    '/procurement',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getProcurement
);


/* ==========================================================================
   5. CUSTOMER INTELLIGENCE
   ========================================================================== */
router.get(
    '/segmentation',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getCustomerSegmentation
);

router.get(
    '/retention',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getCustomerRetention
);


/* ==========================================================================
   6. OPERATIONAL ANALYTICS
   ========================================================================== */
router.get(
    '/operational',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getOperationalReport
);

router.get(
    '/peak-hours',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getPeakHours
);


/* ==========================================================================
   7. SECURITY
   ========================================================================== */
router.get(
    '/security-audit',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
    analyticsController.getSecurityAudit
);


/* ==========================================================================
   8. FORECASTING
   ========================================================================== */
router.get(
    '/forecast',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
    analyticsController.getSalesForecast
);


/* ==========================================================================
   9. ALERT ENGINE
   ========================================================================== */
router.get(
    '/alerts',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getAlerts
);


/* ==========================================================================
   10. EXPORT SYSTEM
   ========================================================================== */
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

// // Protect all analytics routes
// router.use(authController.protect);

// // ==============================================================================
// // 1. EXECUTIVE & STRATEGIC (High-level Overview)
// // ==============================================================================
// router.get('/dashboard', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), 
//     analyticsController.getDashboardOverview
// );

// router.get('/branch-comparison', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), 
//     analyticsController.getBranchComparison
// ); // 🆕 Compare performance across branches

// // ==============================================================================
// // 2. FINANCIAL INTELLIGENCE (Money & Margins)
// // ==============================================================================
// router.get('/financials', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), 
//     analyticsController.getFinancialReport
// );

// router.get('/profitability', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), 
//     analyticsController.getProfitabilityReport
// ); // 🆕 Gross Profit vs Revenue Analysis

// router.get('/cash-flow', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), 
//     analyticsController.getCashFlowReport
// );

// router.get('/debtor-aging', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), 
//     analyticsController.getDebtorAgingReport
// ); // 🆕 Who owes money (0-30, 30-60, 90+ days)

// router.get('/tax-report', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), 
//     analyticsController.getTaxReport
// );

// // ==============================================================================
// // 3. OPERATIONAL & STAFF EFFICIENCY (Day-to-day)
// // ==============================================================================
// router.get('/staff-performance', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
//     analyticsController.getStaffPerformance
// ); // 🆕 Employee sales leaderboard

// router.get('/peak-hours', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
//     analyticsController.getPeakBusinessHours
// ); // 🆕 Heatmap for staffing optimization

// router.get('/procurement', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
//     analyticsController.getProcurementAnalysis
// );

// router.get('/customer-insights', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
//     analyticsController.getCustomerInsights
// );

// // ==============================================================================
// // 4. INVENTORY INTELLIGENCE (Stock Health)
// // ==============================================================================
// router.get('/inventory', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
//     analyticsController.getInventoryReport
// );

// router.get('/product-performance', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
//     analyticsController.getProductPerformance
// );

// router.get('/dead-stock', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
//     analyticsController.getDeadStockReport
// ); // 🆕 Items stuck on shelves

// router.get('/stock-predictions', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
//     analyticsController.getStockOutPredictions
// ); // 🆕 "Will run out in 7 days"

// // ==============================================================================
// // 5. SECURITY & AUDIT (Admin Only)
// // ==============================================================================
// router.get('/security-audit', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), // Or create a specific PERMISSIONS.ADMIN.AUDIT
//     analyticsController.getSecurityAuditLog
// ); // 🆕 Track suspicious deletions/exports

// // ==============================================================================
// // 6. DATA EXPORT (CSV/Excel)
// // ==============================================================================
// router.get('/export', 
//     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA), // Ensure this exists in your config
//     analyticsController.exportAnalyticsData
// ); 

// // NEW ROUTES
// router.get('/forecast', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), 
//     analyticsController.getSalesForecast
// );

// router.get('/customer-segmentation', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
//     analyticsController.getCustomerSegmentation
// );

// router.get('/customer-retention', 
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), 
//     analyticsController.getCustomerRetention
// );

// module.exports = router;

// module.exports = router;
