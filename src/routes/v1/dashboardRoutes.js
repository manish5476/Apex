const express = require("express");
const router = express.Router();
const dashboardController = require("../../controllers/dashboardController");
const authController = require("@modules/auth/core/auth.controller");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get(
  "/",
  checkPermission(PERMISSIONS.DASHBOARD.VIEW), // More specific than ANALYTICS.VIEW_EXECUTIVE
  dashboardController.getDashboardOverview
);
// router.get(
//   "/",
//   checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
//   dashboardController.getDashboardOverview
// );

module.exports = router;