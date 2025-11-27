// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/adminController');
const authController = require('../../controllers/authController');

router.use(authController.protect);
// router.use(authController.restrictTo('admin','Super Admin')); // optional: restrict to admin roles if you have this middleware

// GET /api/v1/admin/summary?startDate=&endDate=&branchId=
router.get('/summary', adminController.summary);

// GET /api/v1/admin/monthly?months=12
router.get('/monthly', adminController.monthlyTrends);

// GET /api/v1/admin/outstanding?type=receivable|payable&limit=20
router.get('/outstanding', adminController.outstanding);

router.get('/top-customers', authController.restrictTo('admin','superadmin'), adminController.topCustomers);
router.get('/top-products', authController.restrictTo('admin','superadmin'), adminController.topProducts);
router.get('/branch-sales', authController.restrictTo('admin','superadmin'), adminController.branchSales);


module.exports = router;
