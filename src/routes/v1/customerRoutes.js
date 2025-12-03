const express = require("express");
const router = express.Router();
const customerController = require("../../controllers/customerController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");
const { upload } = require("../../middleware/uploadMiddleware");

router.use(authController.protect);

// Search & Bulk
router.get("/search", checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.searchCustomers);
router.post("/bulk-update", checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.bulkUpdateCustomers);

// Specific Actions
router.patch("/:id/upload", checkPermission(PERMISSIONS.CUSTOMER.UPDATE), upload.single("photo"), customerController.uploadCustomerPhoto);
router.patch("/:id/restore", checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.restoreCustomer);
router.patch('/:id/credit-limit', checkPermission(PERMISSIONS.CUSTOMER.CREDIT_LIMIT), customerController.updateCreditLimit);

// CRUD
router.route("/")
  .get(checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.getAllCustomers)
  .post(checkPermission(PERMISSIONS.CUSTOMER.CREATE), customerController.createCustomer);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.getCustomer)
  .patch(checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.updateCustomer)
  .delete(checkPermission(PERMISSIONS.CUSTOMER.DELETE), customerController.deleteCustomer);

module.exports = router;

// // src/routes/customerRoutes.js
// const express = require("express");
// const customerController = require("../../controllers/customerController");
// const authController = require("../../controllers/authController");
// const { upload } = require("../../middleware/uploadMiddleware");

// const router = express.Router();

// // -------------------------------------------------------
// // ALL ROUTES REQUIRE LOGIN
// // -------------------------------------------------------
// router.use(authController.protect);

// // -------------------------------------------------------
// // 🔍 SEARCH  (must come BEFORE “/:id” routes)
// // -------------------------------------------------------
// router.get(
//   "/search",
//   authController.restrictTo("read_customers", "superadmin"),
//   customerController.searchCustomers
// );

// // -------------------------------------------------------
// // 🔄 BULK UPDATE (admin-only)
// // -------------------------------------------------------
// router.post(
//   "/bulk-update",
//   authController.restrictTo("update_customers", "superadmin"),
//   customerController.bulkUpdateCustomers
// );

// // -------------------------------------------------------
// // 🖼 CUSTOMER PHOTO UPLOAD
// // -------------------------------------------------------
// router.patch(
//   "/:id/upload",
//   authController.restrictTo("update_customers", "superadmin"),
//   upload.single("photo"),
//   customerController.uploadCustomerPhoto
// );

// // -------------------------------------------------------
// // CRUD ROUTES
// // -------------------------------------------------------
// router
//   .route("/")
//   .get(
//     authController.restrictTo("read_customers", "superadmin"),
//     customerController.getAllCustomers
//   )
//   .post(
//     authController.restrictTo("create_customers", "superadmin"),
//     customerController.createCustomer
//   );

// router
//   .route("/:id")
//   .get(
//     authController.restrictTo("read_customers", "superadmin"),
//     customerController.getCustomer
//   )
//   .patch(
//     authController.restrictTo("update_customers", "superadmin"),
//     customerController.updateCustomer
//   )
//   .delete(
//     authController.restrictTo("delete_customers", "superadmin"),
//     customerController.deleteCustomer
//   );

// // -------------------------------------------------------
// // RESTORE ROUTE
// // -------------------------------------------------------
// router.patch(
//   "/:id/restore",
//   authController.restrictTo("update_customers", "superadmin"),
//   customerController.restoreCustomer
// );

// router.patch('/:id/credit-limit',
//   authController.restrictTo('update_customers','superadmin'),
//   customerController.updateCreditLimit
// );

// module.exports = router;
