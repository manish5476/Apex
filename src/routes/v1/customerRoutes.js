const express = require('express');
const customerController = require('../../controllers/customerController');
const authController = require('../../controllers/authController');

const router = express.Router();

router.use(authController.protect);

router
  .route('/')
  .get(
    authController.restrictTo('read_customers', 'superadmin'),
    customerController.getAllCustomers
  )
  .post(
    authController.restrictTo('create_customers', 'superadmin'),
    customerController.createCustomer
  );

router
  .route('/:id')
  .get(
    authController.restrictTo('read_customers', 'superadmin'),
    customerController.getCustomer
  )
  .patch(
    authController.restrictTo('update_customers', 'superadmin'),
    customerController.updateCustomer
  )
  .delete(
    authController.restrictTo('delete_customers', 'superadmin'),
    customerController.deleteCustomer
  );

router
  .route('/:id/restore')
  .patch(
    authController.restrictTo('update_customers', 'superadmin'),
    customerController.restoreCustomer
  );

module.exports = router;