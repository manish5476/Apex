const express = require("express");
const router = express.Router();
const searchController = require("../../modules/_legacy/controllers/searchController");
const channelController = require("../../modules/organization/core/channel.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get("/global",
  checkPermission(PERMISSIONS.ANALYTICS.READ),
  searchController.globalSearch
);

router.get("/globalchat",
  authController.protect, 
  channelController.globalSearch
);

module.exports = router;