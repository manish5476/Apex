const express = require('express');
const router = express.Router();
const accountController = require('../../controllers/accountController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes
router.use(authController.protect);

router.get(
  '/hierarchy',
  checkPermission(PERMISSIONS.ACCOUNT.MANAGE),
  accountController.getHierarchy
);

router.put(
  '/:id/reparent',
  checkPermission(PERMISSIONS.ACCOUNT.MANAGE),
  accountController.reparentAccount
);

router.route('/')
  .get(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.getAccounts)
  .post(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.createAccount);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.getAccount)
  .put(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.updateAccount)
  .delete(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.deleteAccount);

module.exports = router;


// const express = require('express');
// const router = express.Router();
// const accountController = require('../../controllers/accountController');
// const authController = require('../../controllers/authController');
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);
// router.get('/hierarchy', checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.getHierarchy);
// router.put('/:id/reparent', checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.reparentAccount);
// router.route('/')
//   .get(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.getAccounts)
//   .post(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.createAccount);

// router.route('/:id')
//   .get(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.getAccount)
//   .put(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.updateAccount)
//   .delete(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.deleteAccount);

// module.exports = router;