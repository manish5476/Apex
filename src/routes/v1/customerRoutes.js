const express = require("express");
const router = express.Router();
const customerController = require("../../controllers/customerController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");
const { upload } = require("../../middleware/uploadMiddleware");

router.use(authController.protect);

router.get("/search", checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.searchCustomers);
router.post("/bulk-update", checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.bulkUpdateCustomers);

router.patch("/:id/upload", checkPermission(PERMISSIONS.CUSTOMER.UPDATE), upload.single("avatar"), customerController.uploadCustomerPhoto);
router.patch("/:id/restore", checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.restoreCustomer);
router.patch("/:id/credit-limit", checkPermission(PERMISSIONS.CUSTOMER.CREDIT_LIMIT), customerController.updateCreditLimit);
router.get("/check-duplicate", checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.checkDuplicate);

router.post("/bulk-customer", checkPermission(PERMISSIONS.CUSTOMER.CREATE), customerController.createBulkCustomer);

router.route("/")
  .get(checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.getAllCustomers)
  .post(checkPermission(PERMISSIONS.CUSTOMER.CREATE), customerController.createCustomer);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.getCustomer)
  .patch(checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.updateCustomer)
  .delete(checkPermission(PERMISSIONS.CUSTOMER.DELETE), customerController.deleteCustomer);

module.exports = router;


// const express = require("express");
// const router = express.Router();
// const customerController = require("../../controllers/customerController");
// const authController = require("../../controllers/authController");
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");
// const { upload } = require("../../middleware/uploadMiddleware");

// router.use(authController.protect);

// // Search & Bulk
// router.get("/search", checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.searchCustomers);
// router.post("/bulk-update", checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.bulkUpdateCustomers);

// // Specific Actions
// router.patch("/:id/upload", checkPermission(PERMISSIONS.CUSTOMER.UPDATE), upload.single("avatar"), customerController.uploadCustomerPhoto);
// router.patch("/:id/restore", checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.restoreCustomer);
// router.patch('/:id/credit-limit', checkPermission(PERMISSIONS.CUSTOMER.CREDIT_LIMIT), customerController.updateCreditLimit);
// router.get("/check-duplicate", checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.checkDuplicate);
// // CRUD
// router.route("/bulk-customer")  .post(checkPermission(PERMISSIONS.CUSTOMER.CREATE), customerController.createBulkCustomer);

// router.route("/")
//   .get(checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.getAllCustomers)
//   .post(checkPermission(PERMISSIONS.CUSTOMER.CREATE), customerController.createCustomer);

// router.route("/:id")
//   .get(checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.getCustomer)
//   .patch(checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.updateCustomer)
//   .delete(checkPermission(PERMISSIONS.CUSTOMER.DELETE), customerController.deleteCustomer);

// module.exports = router;
