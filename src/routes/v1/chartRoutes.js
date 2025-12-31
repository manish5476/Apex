const express = require('express');
const router = express.Router();
const chartController = require('../../controllers/chartController');
const authController = require('../../controllers/authController');
const { checkPermission } = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

router.use(authController.protect);

// 1. Financial Trend (Line/Bar)
// Query: ?year=2024&interval=month
router.get('/financial-trend',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getFinancialTrend
);

// 2. Sales Distribution (Pie/Donut)
// Query: ?groupBy=category|branch|paymentMethod&startDate=...&endDate=...
router.get('/sales-distribution',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getSalesDistribution
);

// 3. Branch Performance Radar (Radar)
// Query: ?startDate=...&endDate=...
router.get('/branch-radar',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getBranchPerformanceRadar
);

// 4. Order Funnel (Funnel/Bar)
// Query: ?startDate=...&endDate=...
router.get('/order-funnel',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getOrderFunnel
);

// 5. Year-over-Year Growth (Line)
router.get('/yoy-growth',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getYoYGrowth
);

// 6. Top Performers (Horizontal Bar)
// Query: ?type=product|customer&limit=10
router.get('/top-performers',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getTopPerformers
);

// 7. Customer Acquisition (Line)
router.get('/customer-acquisition',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getCustomerAcquisition
);

// 8. AOV Trend (Line)
router.get('/aov-trend',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getAOVTrend
);

// 9. Heatmap (Matrix)
router.get('/heatmap',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getHeatmap
);

module.exports = router;
