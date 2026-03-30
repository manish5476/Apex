const express = require('express');
const router = express.Router();
const chartController = require('../../modules/_legacy/controllers/chartController');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');
router.use(authController.protect);
router.get('/financial-trend', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getFinancialTrend);
router.get('/sales-distribution', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getSalesDistribution);
router.get('/yoy-growth', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getYoYGrowth);
router.get('/branch-radar', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getBranchPerformanceRadar);
router.get('/order-funnel', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getOrderFunnel)
router.get('/top-performers', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getTopPerformers)
router.get('/customer-acquisition', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getCustomerAcquisition)
router.get('/aov-trend', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getAOVTrend)
router.get('/heatmap', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getHeatmap);
module.exports = router;