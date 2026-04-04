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
/** GET / @payload none */
router.get("/", checkPermission(PERMISSIONS.MASTER.READ), masterTypeController.getMasterTypes);

// ==============================================================================
// 2. WRITE/MANAGE OPERATIONS
// ==============================================================================
/** POST / @payload { code*, name*, description, schema, isSystem } */
router.post("/", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.createMasterType);

// Dynamic ID routes safely at the bottom
/** PATCH /:id @params { id } @payload { name, description, schema, etc } */
router.patch("/:id", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.updateMasterType);

/** DELETE /:id @params { id } @payload none */
router.delete("/:id", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.deleteMasterType);

module.exports = router;