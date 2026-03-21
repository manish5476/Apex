const express = require("express");
const router = express.Router();
const analyticsController = require("../../modules/organization/core/customerAnalytics");
const cacheMiddleware = require("../../core/middleware/cache.middleware");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all analytics routes globally
router.use(authController.protect);

/**
 * --------------------------------------------------------
 * 1. CACHED ROUTES (Heavy Aggregations)
 * --------------------------------------------------------
 * We use a longer TTL (Time-To-Live) for LTV and Segmentation 
 * as these metrics typically don't change minute-to-minute.
 */

router.get(
    '/overview', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(300), // 5 mins
    analyticsController.getCustomerOverview
);

router.get(
    '/financials', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(300), 
    analyticsController.getCustomerFinancialAnalytics
);

router.get(
    '/payment-behavior', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(300), 
    analyticsController.getCustomerPaymentBehavior
);

router.get(
    '/ltv', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(600), // 10 mins
    analyticsController.getCustomerLifetimeValue
);

router.get(
    '/segmentation', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(600), 
    analyticsController.getCustomerSegmentation
);

router.get(
    '/geospatial', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    cacheMiddleware(600), 
    analyticsController.getCustomerGeospatial
);

/**
 * --------------------------------------------------------
 * 2. REAL-TIME & SENSITIVE ROUTES (No Cache)
 * --------------------------------------------------------
 */

router.get(
    '/realtime', 
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    analyticsController.getRealTimeDashboard
);

// High-security permission for EMI debt data
router.get(
    '/emi', 
    checkPermission(PERMISSIONS.ANALYTICS.EMI_READ),
    analyticsController.getCustomerEMIAnalytics
);

/**
 * --------------------------------------------------------
 * 3. EXPORT ROUTES (Streamed / No Cache)
 * --------------------------------------------------------
 */

router.get(
    '/export/financials', 
    checkPermission(PERMISSIONS.ANALYTICS.EXPORT),
    analyticsController.exportFinancialsToCSV
);

module.exports = router;