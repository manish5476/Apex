/**
 * ============================================================
 * APEX CRM — chart.routes.js  (Complete — 18 endpoints)
 * ============================================================
 * All routes protected by authController.protect and
 * PERMISSIONS.ANALYTICS.READ.
 *
 * Base path (registered in app.js): /api/v1/charts
 * ============================================================
 */

'use strict';

const express = require('express');
const router = express.Router();
const chartCtrl = require('../../modules/_legacy/controllers/chartController');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

// ── Global auth guard ─────────────────────────────────────────
router.use(authController.protect);

const analytics = checkPermission(PERMISSIONS.ANALYTICS.READ);

// ─────────────────────────────────────────────────────────────
// FINANCIAL & SALES
// ─────────────────────────────────────────────────────────────

/**
 * GET /charts/financial-trend
 * Income / Expense / Net Profit mixed chart
 * ?year=2024  &interval=month
 */
router.get('/financial-trend', analytics, chartCtrl.getFinancialTrend);

/**
 * GET /charts/gross-profit
 * Revenue vs Gross Profit + Margin % (dual-axis)
 * ?year=2024
 */
router.get('/gross-profit', analytics, chartCtrl.getGrossProfitTrend);

/**
 * GET /charts/yoy-growth
 * Year-over-Year revenue comparison with growth %
 * ?year=2024
 */
router.get('/yoy-growth', analytics, chartCtrl.getYoYGrowth);

/**
 * GET /charts/purchase-vs-sales
 * Monthly purchase spend vs sales revenue + net cash impact
 * ?year=2024
 */
router.get('/purchase-vs-sales', analytics, chartCtrl.getPurchaseVsSales);

/**
 * GET /charts/return-rate
 * Sales return rate % month-by-month
 * ?year=2024
 */
router.get('/return-rate', analytics, chartCtrl.getSalesReturnRate);

// ─────────────────────────────────────────────────────────────
// DISTRIBUTION & SEGMENTATION
// ─────────────────────────────────────────────────────────────

/**
 * GET /charts/sales-distribution
 * Pie/Donut — Sales by category | branch | paymentMethod
 * ?groupBy=category  &startDate=  &endDate=
 */
router.get('/sales-distribution', analytics, chartCtrl.getSalesDistribution);

/**
 * GET /charts/payment-methods
 * Payment method inflow breakdown (pie + stacked monthly trend)
 * ?startDate=  &endDate=
 */
router.get('/payment-methods', analytics, chartCtrl.getPaymentMethodBreakdown);

// ─────────────────────────────────────────────────────────────
// BRANCH & PERFORMANCE
// ─────────────────────────────────────────────────────────────

/**
 * GET /charts/branch-radar
 * Radar — Branch performance on 5 normalized metrics
 * ?startDate=  &endDate=
 */
router.get('/branch-radar', analytics, chartCtrl.getBranchPerformanceRadar);

/**
 * GET /charts/top-performers
 * Horizontal bar — Top products | customers | staff
 * ?type=products  &limit=5  &startDate=  &endDate=
 */
router.get('/top-performers', analytics, chartCtrl.getTopPerformers);

// ─────────────────────────────────────────────────────────────
// ORDERS & PIPELINE
// ─────────────────────────────────────────────────────────────

/**
 * GET /charts/order-funnel
 * Invoice status funnel — Created → Active → Partial → Paid
 * ?startDate=  &endDate=
 */
router.get('/order-funnel', analytics, chartCtrl.getOrderFunnel);

/**
 * GET /charts/aov-trend
 * Average Order Value + order count (dual-axis)
 * ?year=2024
 */
router.get('/aov-trend', analytics, chartCtrl.getAOVTrend);

/**
 * GET /charts/heatmap
 * Orders by DayOfWeek × Hour matrix (last N days)
 * ?branchId=  &days=30
 */
router.get('/heatmap', analytics, chartCtrl.getHeatmap);

// ─────────────────────────────────────────────────────────────
// CUSTOMERS
// ─────────────────────────────────────────────────────────────

/**
 * GET /charts/customer-acquisition
 * New customers per month + cumulative (dual-axis)
 * ?year=2024
 */
router.get('/customer-acquisition', analytics, chartCtrl.getCustomerAcquisition);

/**
 * GET /charts/customer-outstanding
 * Top debtors by outstanding balance — red flag if over credit limit
 * ?limit=10
 */
router.get('/customer-outstanding', analytics, chartCtrl.getCustomerOutstanding);

// ─────────────────────────────────────────────────────────────
// INVENTORY
// ─────────────────────────────────────────────────────────────

/**
 * GET /charts/inventory-health
 * Healthy / Low / Critical stock per branch (stacked bar)
 * ?branchId=   (optional — omit for all branches)
 */
router.get('/inventory-health', analytics, chartCtrl.getInventoryHealth);

// ─────────────────────────────────────────────────────────────
// FINANCE — EMI
// ─────────────────────────────────────────────────────────────

/**
 * GET /charts/emi-portfolio
 * EMI status breakdown + overdue installment count & amount
 * No query params — org-wide snapshot
 */
router.get('/emi-portfolio', analytics, chartCtrl.getEmiPortfolioStats);

// ─────────────────────────────────────────────────────────────
// HRMS
// ─────────────────────────────────────────────────────────────

/**
 * GET /charts/attendance-kpis
 * Daily present / absent / late trend (last N days)
 * ?branchId=  &days=30
 */
router.get('/attendance-kpis', analytics, chartCtrl.getAttendanceKpis);

/**
 * GET /charts/leave-utilization
 * Used vs Remaining leave days by type for a financial year
 * ?financialYear=2024-2025
 */
router.get('/leave-utilization', analytics, chartCtrl.getLeaveUtilization);

module.exports = router;
// const express = require('express');
// const router = express.Router();
// const chartController = require('../../modules/_legacy/controllers/chartController');
// const authController = require('../../modules/auth/core/auth.controller');
// const { checkPermission } = require('../../core/middleware/permission.middleware');
// const { PERMISSIONS } = require('../../config/permissions');
// router.use(authController.protect);
// router.get('/financial-trend', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getFinancialTrend);
// router.get('/sales-distribution', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getSalesDistribution);
// router.get('/yoy-growth', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getYoYGrowth);
// router.get('/branch-radar', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getBranchPerformanceRadar);
// router.get('/order-funnel', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getOrderFunnel)
// router.get('/top-performers', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getTopPerformers)
// router.get('/customer-acquisition', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getCustomerAcquisition)
// router.get('/aov-trend', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getAOVTrend)
// router.get('/heatmap', checkPermission(PERMISSIONS.ANALYTICS.READ), chartController.getHeatmap);
// module.exports = router;