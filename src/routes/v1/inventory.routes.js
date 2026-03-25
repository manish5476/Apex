const express = require("express");
const router = express.Router();
const inventoryController = require("../../modules/inventory/core/inventory.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// STOCK MOVEMENT & ADJUSTMENTS
// ======================================================

// Move stock between branches or warehouses
router.post(
  "/transfer", 
  checkPermission(PERMISSIONS.STOCK.MANAGE), 
  inventoryController.transferStock
);

// Manually adjust stock levels (e.g., for breakage or count errors)
router.post(
  "/adjust", 
  checkPermission(PERMISSIONS.PRODUCT.STOCK_ADJUST), 
  inventoryController.adjustStock
);

// Future: Track history of movements for a specific item
// router.get(
//   "/:id/history", 
//   checkPermission(PERMISSIONS.PRODUCT.READ), 
//   inventoryController.getProductHistory
// );

module.exports = router;