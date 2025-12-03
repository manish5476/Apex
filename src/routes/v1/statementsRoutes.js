const express = require('express');
const router = express.Router();
const statementsController = require('../../controllers/statementsController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get('/pl', checkPermission(PERMISSIONS.STATEMENT.READ), statementsController.pl);
router.get('/balance-sheet', checkPermission(PERMISSIONS.STATEMENT.READ), statementsController.balanceSheet);
router.get('/trial-balance', checkPermission(PERMISSIONS.STATEMENT.READ), statementsController.trialBalance);

module.exports = router;

// // src/routes/statementsRoutes.js
// const express = require('express');
// const router = express.Router();
// const statementsController = require('../../controllers/statementsController');
// const authController = require('../../controllers/authController');

// router.use(authController.protect);
// // optionally restrict to finance roles
// // router.use(authController.restrictTo('admin','finance'));

// router.get('/pl', statementsController.pl);
// router.get('/balance-sheet', statementsController.balanceSheet);
// router.get('/trial-balance', statementsController.trialBalance);

// module.exports = router;
