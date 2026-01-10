const express = require("express");
const router = express.Router();
const analyticsController = require("../../modules/organization/core/customerAnalytics");
const cacheMiddleware = require("../../core/middleware/cache.middleware");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");
const { upload } = require("../../core/middleware/upload.middleware");

router.use(authController.protect);

/**
 * --------------------------------------------------------
 * CACHED ROUTES (Heavy Aggregations)
 * --------------------------------------------------------
 */

// 1. Dashboard Overview
router.get(
    '/overview', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(300), 
    analyticsController.getCustomerOverview
);

// 2. Financials & Charts
router.get(
    '/financials', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(300), 
    analyticsController.getCustomerFinancialAnalytics
);

// 3. Payment Behavior
router.get(
    '/payment-behavior', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(300), 
    analyticsController.getCustomerPaymentBehavior
);

// 4. LTV Analysis
router.get(
    '/ltv', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(600), 
    analyticsController.getCustomerLifetimeValue
);

// 5. Segmentation
router.get(
    '/segmentation', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(600), 
    analyticsController.getCustomerSegmentation
);

// 6. Geospatial
router.get(
    '/geospatial', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(600), 
    analyticsController.getCustomerGeospatial
);

/**
 * --------------------------------------------------------
 * REAL-TIME ROUTES (No Cache)
 * --------------------------------------------------------
 */

// 7. Real-time Widgets
router.get(
    '/realtime', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    analyticsController.getRealTimeDashboard
);

// 8. EMI (Sensitive Data)
router.get(
    '/emi', 
    checkPermission(PERMISSIONS.ANALYTICS.EMI_READ),
    analyticsController.getCustomerEMIAnalytics
);

/**
 * --------------------------------------------------------
 * EXPORT ROUTES (Streamed / No Cache)
 * --------------------------------------------------------
 */

// 9. CSV Export
router.get(
    '/export/financials', 
    checkPermission(PERMISSIONS.ANALYTICS.EXPORT),
    analyticsController.exportFinancialsToCSV
);

module.exports = router;