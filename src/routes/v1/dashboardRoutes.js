const express = require("express");
const dashboardController = require("../../controllers/dashboardController");
const authController = require("../../controllers/authController");

const router = express.Router();
/* ==========================================================
 *  PROTECTED ROUTE
 * ========================================================== */
router.use(authController.protect);

router.get(
  "/",
  authController.restrictTo("superadmin", "admin"),
  dashboardController.getDashboardOverview,
);

module.exports = router;
