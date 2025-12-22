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

// // Legacy Admin routes mapped to new Analytics permissions
// const express = require('express');
// const router = express.Router();
// const adminController = require('../../controllers/adminController');
// const authController = require('../../controllers/authController');
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// router.get('/summary', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), adminController.summary);
// router.get('/monthly', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), adminController.monthlyTrends);
// router.get('/outstanding', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), adminController.outstanding);

// router.get('/top-customers', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), adminController.topCustomers);
// router.get('/top-products', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), adminController.topProducts);
// router.get('/branch-sales', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), adminController.branchSales);

// router.get('/outstanding-list', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), adminController.outstanding); 
// router.get('/branch-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), adminController.branchSales);

// module.exports = router;
