const express = require('express');
const chartController = require('../../controllers/chartController');
const authController = require('../../controllers/authController');
const { checkPermission } = require('../../middleware/permissionMiddleware');
const PERMISSIONS = require('../../config/permissions');

const router = express.Router();

router.use(authController.protect);

// 1. Financial Trend (Line/Bar)
router.get(
    '/financial-trend', 
    checkPermission(PERMISSIONS.ANALYTICS.READ), 
    chartController.getFinancialTrend
);

// 2. Sales Distribution (Pie/Donut)
router.get(
    '/sales-distribution', 
    checkPermission(PERMISSIONS.ANALYTICS.READ), 
    chartController.getSalesDistribution
);

// 3. Branch Performance (Radar)
router.get(
    '/branch-radar', 
    checkPermission(PERMISSIONS.ANALYTICS.READ), 
    chartController.getBranchPerformanceRadar
);

// 4. Order Funnel (Funnel)
router.get(
    '/order-funnel', 
    checkPermission(PERMISSIONS.ANALYTICS.READ), 
    chartController.getOrderFunnel
);

module.exports = router;