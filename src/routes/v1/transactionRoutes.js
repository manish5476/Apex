const express = require('express');
const router = express.Router();
const transactionController = require('../../controllers/transactionController');
const monitorController = require('../../controllers/monitorController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// General Ledger (Transactions)
router.get('/', checkPermission(PERMISSIONS.TRANSACTION.READ), transactionController.getTransactions);
router.get('/export', checkPermission(PERMISSIONS.TRANSACTION.READ), transactionController.exportTransactionsCsv);

// System Monitor (Logs)
router.get("/monitor/transactions", checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), monitorController.getRecentTransactions);

module.exports = router;
// const express = require('express');
// const router = express.Router();
// const transactionController = require('../../controllers/transactionController');
// const monitorController = require('../../controllers/monitorController');
// const authController = require('../../controllers/authController');
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// router.get('/', checkPermission(PERMISSIONS.TRANSACTION.READ), transactionController.getTransactions);
// router.get('/export', checkPermission(PERMISSIONS.TRANSACTION.READ), transactionController.exportTransactionsCsv);

// // Monitor is Executive/Analytics
// router.get("/monitor/transactions", checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), monitorController.getRecentTransactions);

// module.exports = router;

// // // src/routes/transactionRoutes.js
// // const express = require('express');
// // const router = express.Router();
// // const transactionController = require('../../controllers/transactionController');
// // const authController = require('../../controllers/authController'); // adjust path if necessary
// // const monitorController= require('../../controllers/monitorController'); // adjust path if necessary
// // // protect route
// // router.use(authController.protect);

// // router.get('/', transactionController.getTransactions);
// // router.get('/export', transactionController.exportTransactionsCsv);

// // router.get("/monitor/transactions", authController.restrictTo("superadmin"), monitorController.getRecentTransactions);
// // // router.get('/:id', transactionController.getTransactionById);
// // // router.patch('/:id', authController.restrictTo('superadmin','admin'), transactionController.updateTransaction);
// // // router.delete('/:id', authController.restrictTo('superadmin'), transactionController.deleteTransaction);

// // module.exports = router;
