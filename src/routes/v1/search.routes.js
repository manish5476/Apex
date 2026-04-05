'use strict';

const express = require('express');
const router = express.Router();

const authController = require('../../modules/auth/core/auth.controller');
const searchController = require('../../modules/dashboard/core/searchController');

// All search routes require authentication
router.use(authController.protect);

// GET /api/v1/search?q=john&types=customer,supplier&limit=5
// Full global search — returns grouped + flat + summary
router.get('/', searchController.globalSearch);

// GET /api/v1/search/lookup?type=customer&q=john&limit=10
// Lightweight autocomplete — only _id + label, no populate
// Use this for form dropdowns (customer selector, product picker, etc.)
router.get('/lookup', searchController.quickLookup);

module.exports = router;


// const express = require("express");
// const router = express.Router();
// const searchController = require("../../modules/dashboard/core/searchController");
// const channelController = require("../../modules/organization/core/channel.controller");
// const authController = require("../../modules/auth/core/auth.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// // Protect all routes (This covers EVERYTHING below it)
// router.use(authController.protect);

// // Global System Search
// router.get("/global",
//   checkPermission(PERMISSIONS.SEARCH.GLOBAL), // Changed this from ANALYTICS.READ to match your config!
//   searchController.globalSearch
// );

// // Global Chat Search
// // Removed the redundant authController.protect here
// router.get("/globalchat",
//   // If you only want specific roles searching chat, add checkPermission(PERMISSIONS.SEARCH.GLOBAL) here.
//   // If any logged-in user should be able to search their chats, leave it as-is!
//   channelController.globalSearch
// );

// module.exports = router;
