const express = require("express");
const router = express.Router();
const dashboardController = require("../../controllers/dashboardController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get(
  "/",
  checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
  dashboardController.getDashboardOverview
);

module.exports = router;


// // Maps to the same logic as Analytics/Admin
// const express = require("express");
// const router = express.Router();
// const dashboardController = require("../../controllers/dashboardController");
// const authController = require("../../controllers/authController");
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// router.get("/", checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), dashboardController.getDashboardOverview);

// module.exports = router;
