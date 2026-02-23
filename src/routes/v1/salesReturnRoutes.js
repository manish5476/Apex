// src/routes/v1/salesReturnRoutes.js
const express = require('express');
const router = express.Router();
const salesReturnController = require('../../modules/inventory/core/salesReturn.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes
router.use(authController.protect);

// Create a new sales return
router.post(
  '/', 
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE), 
  salesReturnController.createReturn
);

// Get a list of sales returns
router.get(
  '/', 
  checkPermission(PERMISSIONS.SALES_RETURN.READ), 
  salesReturnController.getReturns
);

module.exports = router;
