const express = require('express');
const router = express.Router();
const adminController = require('../../modules/_legacy/controllers/adminController');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all admin analytics routes
router.use(authController.protect);

// ======================================================
// 1. FINANCIAL & SUMMARY OVERVIEW
// ======================================================

// High-level company snapshot
router.get('/summary', 
  checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), 
  adminController.summary
);

// Financial trends (Revenue, Expense, Profit)
router.get('/monthly', 
  checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), 
  adminController.monthlyTrends
);

// Outstanding dues and aging reports
router.get('/outstanding', 
  checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), 
  adminController.outstanding
);

// ======================================================
// 2. PERFORMANCE RANKINGS
// ======================================================

// Top 10 Customers by volume/revenue
router.get('/top-customers', 
  checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), 
  adminController.topCustomers
);

// Most profitable or highest volume products
router.get('/top-products', 
  checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), 
  adminController.topProducts
);

// Cross-branch sales comparison and KPIs
router.get('/branch-performance', 
  checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), 
  adminController.branchSales
);

module.exports = router;