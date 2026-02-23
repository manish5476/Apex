const express = require("express");
const router = express.Router();
const authController = require("../../modules/auth/core/auth.controller");
const masterTypeController = require("../../modules/master/core/masterType.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

// ==============================================================================
// 1. READ OPERATIONS
// ==============================================================================
router.get("/", checkPermission(PERMISSIONS.MASTER.READ), masterTypeController.getMasterTypes);

// ==============================================================================
// 2. WRITE/MANAGE OPERATIONS
// ==============================================================================
router.post("/", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.createMasterType);

// Dynamic ID routes safely at the bottom
router.patch("/:id", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.updateMasterType);
router.delete("/:id", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.deleteMasterType);

module.exports = router;