const express = require("express");
const router = express.Router();
const inventoryController = require("../../controllers/inventoryController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions"); // Ensure you add PRODUCT.ADJUST to permissions config

router.use(authController.protect);

router.post("/transfer", checkPermission(PERMISSIONS.PRODUCT.UPDATE), inventoryController.transferStock);
router.post("/adjust", checkPermission(PERMISSIONS.PRODUCT.STOCK_ADJUST), inventoryController.adjustStock);
router.get("/:id/history", checkPermission(PERMISSIONS.PRODUCT.READ), inventoryController.getProductHistory);

// router.post("/transfer", checkPermission(PERMISSIONS.PRODUCT.UPDATE), inventoryController.transferStock);
// router.post("/adjust", checkPermission(PERMISSIONS.PRODUCT.UPDATE), inventoryController.adjustStock); // Or new permission PRODUCT.ADJUST
// router.get("/:id/history", checkPermission(PERMISSIONS.PRODUCT.READ), inventoryController.getProductHistory);

module.exports = router;