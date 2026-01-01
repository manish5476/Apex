const express = require("express");
const router = express.Router();
const authController = require("@modules/auth/core/auth.controller");
const masterTypeController = require("../../controllers/masterTypeController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// Read All
router.get("/", checkPermission(PERMISSIONS.MASTER.READ), masterTypeController.getMasterTypes);

// Manage
router.post("/", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.createMasterType);
router.patch("/:id", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.updateMasterType);
router.delete("/:id", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.deleteMasterType);

module.exports = router;
