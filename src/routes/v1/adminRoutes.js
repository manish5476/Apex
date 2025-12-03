// Legacy Admin routes mapped to new Analytics permissions
const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/adminController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get('/summary', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), adminController.summary);
router.get('/monthly', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), adminController.monthlyTrends);
router.get('/outstanding', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), adminController.outstanding);

router.get('/top-customers', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), adminController.topCustomers);
router.get('/top-products', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), adminController.topProducts);
router.get('/branch-sales', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), adminController.branchSales);

router.get('/outstanding-list', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), adminController.outstanding); 
router.get('/branch-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), adminController.branchSales);

module.exports = router;


// // src/routes/adminRoutes.js
// const express = require('express');
// const router = express.Router();
// const adminController = require('../../controllers/adminController');
// const authController = require('../../controllers/authController');

// router.use(authController.protect);
// // router.use(authController.restrictTo('admin','Super Admin')); // optional: restrict to admin roles if you have this middleware

// // GET /api/v1/admin/summary?startDate=&endDate=&branchId=
// router.get('/summary', adminController.summary);

// // GET /api/v1/admin/monthly?months=12
// router.get('/monthly', adminController.monthlyTrends);

// // GET /api/v1/admin/outstanding?type=receivable|payable&limit=20
// router.get('/outstanding', adminController.outstanding);

// router.get('/top-customers', authController.restrictTo('admin','superadmin'), adminController.topCustomers);
// router.get('/top-products', authController.restrictTo('admin','superadmin'), adminController.topProducts);
// router.get('/branch-sales', authController.restrictTo('admin','superadmin'), adminController.branchSales);


// module.exports = router;
