const express = require("express");
const router = express.Router();
const searchController = require("../../controllers/searchController");
const authController = require("@modules/auth/core/auth.controller");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get("/global",
  checkPermission(PERMISSIONS.ANALYTICS.READ),
  searchController.globalSearch
);

module.exports = router;