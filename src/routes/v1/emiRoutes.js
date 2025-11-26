const express = require("express");
const emiController = require("../../controllers/emiController");
const authController = require("../../controllers/authController");

const router = express.Router();

// Protect all routes
router.use(authController.protect);

/* ==========================================================
   1. GENERAL ROUTES (Root /)
   ========================================================== */
router
  .route("/")
  // Get All EMIs (List View)
  .get(
    authController.restrictTo("superadmin", "admin", "employee"),
    emiController.getAllEmis
  )
  // Create EMI Plan
  .post(
    authController.restrictTo("superadmin", "admin"),
    emiController.createEmiPlan
  );

/* ==========================================================
   2. SPECIFIC ACTION ROUTES
   ========================================================== */

// Pay EMI installment
router.patch(
  "/pay",
  authController.restrictTo("superadmin", "admin", "employee"),
  emiController.payEmiInstallment
);

// Get EMI details by INVOICE ID
router.get(
  "/invoice/:invoiceId",
  authController.restrictTo("superadmin", "admin", "employee"),
  emiController.getEmiByInvoice
);

/* ==========================================================
   3. ID ROUTES (Must be last to avoid conflict)
   ========================================================== */

// Get Specific EMI by EMI ID
router.get(
  "/:id",
  authController.restrictTo("superadmin", "admin", "employee"),
  emiController.getEmiById
);

module.exports = router;
