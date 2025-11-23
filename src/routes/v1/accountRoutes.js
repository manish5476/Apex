// // src/routes/accountRoutes.js
// const express = require('express');
// const router = express.Router();
// const accountController = require('../../controllers/accountController');
// const authController = require('../../controllers/authController'); // adapt path

// router.use(authController.protect);
// // router.use(authController.restrictTo('admin', 'super-admin')); // only admins manage COA

// router.post('/', accountController.createAccount);
// router.get('/', accountController.getAccounts);
// router.get('/:id', accountController.getAccount);
// router.put('/:id', accountController.updateAccount);
// router.delete('/:id', accountController.deleteAccount);
// router.get('/hierarchy', accountController.getHierarchy);
// router.put('/:id/reparent', accountController.reparentAccount);

// module.exports = router;
