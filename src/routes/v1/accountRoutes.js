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
// // // src/routes/accountRoutes.js
// // const express = require('express');
// // const router = express.Router();
// // const accountController = require('../../controllers/accountController');
// // const authController = require('../../controllers/authController'); // adapt path

// // router.use(authController.protect);
// // // router.use(authController.restrictTo('admin', 'super-admin')); // only admins manage COA

// // router.post('/', accountController.createAccount);
// // router.get('/', accountController.getAccounts);
// // router.get('/:id', accountController.getAccount);
// // router.put('/:id', accountController.updateAccount);
// // router.delete('/:id', accountController.deleteAccount);
// // router.get('/hierarchy', accountController.getHierarchy);
// // router.put('/:id/reparent', accountController.reparentAccount);

// // module.exports = router;
