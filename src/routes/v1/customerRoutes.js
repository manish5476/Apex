// src/routes/customerRoutes.js
const express = require("express");
const customerController = require("../../controllers/customerController");
const authController = require("../../controllers/authController");
const { upload } = require("../../middleware/uploadMiddleware");

const router = express.Router();

// -------------------------------------------------------
// ALL ROUTES REQUIRE LOGIN
// -------------------------------------------------------
router.use(authController.protect);

// -------------------------------------------------------
// 🔍 SEARCH  (must come BEFORE “/:id” routes)
// -------------------------------------------------------
router.get(
  "/search",
  authController.restrictTo("read_customers", "superadmin"),
  customerController.searchCustomers
);

// -------------------------------------------------------
// 🔄 BULK UPDATE (admin-only)
// -------------------------------------------------------
router.post(
  "/bulk-update",
  authController.restrictTo("update_customers", "superadmin"),
  customerController.bulkUpdateCustomers
);

// -------------------------------------------------------
// 🖼 CUSTOMER PHOTO UPLOAD
// -------------------------------------------------------
router.patch(
  "/:id/upload",
  authController.restrictTo("update_customers", "superadmin"),
  upload.single("photo"),
  customerController.uploadCustomerPhoto
);

// -------------------------------------------------------
// CRUD ROUTES
// -------------------------------------------------------
router
  .route("/")
  .get(
    authController.restrictTo("read_customers", "superadmin"),
    customerController.getAllCustomers
  )
  .post(
    authController.restrictTo("create_customers", "superadmin"),
    customerController.createCustomer
  );

router
  .route("/:id")
  .get(
    authController.restrictTo("read_customers", "superadmin"),
    customerController.getCustomer
  )
  .patch(
    authController.restrictTo("update_customers", "superadmin"),
    customerController.updateCustomer
  )
  .delete(
    authController.restrictTo("delete_customers", "superadmin"),
    customerController.deleteCustomer
  );

// -------------------------------------------------------
// RESTORE ROUTE
// -------------------------------------------------------
router.patch(
  "/:id/restore",
  authController.restrictTo("update_customers", "superadmin"),
  customerController.restoreCustomer
);

module.exports = router;
