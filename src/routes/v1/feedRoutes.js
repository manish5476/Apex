const express = require("express");
const router = express.Router();
const feedController = require("../../controllers/feedController");
const authController = require("@modules/auth/core/auth.controller");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);
router.get("/customer/:customerId", 
  checkPermission(PERMISSIONS.FEED.READ), 
  feedController.getCustomerFeed
);

// router.get("/customer/:customerId", checkPermission(PERMISSIONS.CUSTOMER.READ), feedController.getCustomerFeed);

module.exports = router;