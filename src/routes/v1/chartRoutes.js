const express = require('express');
const router = express.Router();
const chartController = require('../../modules/_legacy/controllers/chartController');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. SALES & VOLUME TRENDS
// ======================================================

// Financial Trend (Line/Bar) - e.g., Monthly Revenue vs Expense
router.get('/financial-trend',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getFinancialTrend
);

// Sales Distribution (Pie/Donut) - e.g., Revenue by Product Category
router.get('/sales-distribution',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getSalesDistribution
);

// Year-over-Year Growth (Line) - Comparing current vs previous year performance
router.get('/yoy-growth',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getYoYGrowth
);

// ======================================================
// 2. PERFORMANCE & CONVERSION
// ======================================================

// Branch Performance (Radar) - Comparing branches across multiple KPIs
router.get('/branch-radar',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getBranchPerformanceRadar
);

// Order Funnel (Funnel) - Tracking conversion from Quote -> Order -> Invoice
router.get('/order-funnel',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getOrderFunnel
);

// Top Performers (Horizontal Bar) - Top 10 Products or Customers
router.get('/top-performers',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getTopPerformers
);

// ======================================================
// 3. CUSTOMER METRICS & ACTIVITY
// ======================================================

// Customer Acquisition (Line) - New signups/customers over time
router.get('/customer-acquisition',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getCustomerAcquisition
);

// AOV Trend (Line) - Average Order Value progression
router.get('/aov-trend',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getAOVTrend
);

// Heatmap (Matrix) - Sales density by day/hour or location
router.get('/heatmap',
    checkPermission(PERMISSIONS.ANALYTICS.READ),
    chartController.getHeatmap
);

module.exports = router;