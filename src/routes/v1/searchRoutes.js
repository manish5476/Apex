const express = require("express");
const router = express.Router();
const searchController = require("../../modules/_legacy/controllers/searchController");
const channelController = require("../../modules/organization/core/channel.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes (This covers EVERYTHING below it)
router.use(authController.protect);

// Global System Search
router.get("/global",
  checkPermission(PERMISSIONS.SEARCH.GLOBAL), // Changed this from ANALYTICS.READ to match your config!
  searchController.globalSearch
);

// Global Chat Search
// Removed the redundant authController.protect here
router.get("/globalchat",
  // If you only want specific roles searching chat, add checkPermission(PERMISSIONS.SEARCH.GLOBAL) here.
  // If any logged-in user should be able to search their chats, leave it as-is!
  channelController.globalSearch
);

module.exports = router;
