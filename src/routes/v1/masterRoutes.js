const express = require("express");
const router = express.Router();
const masterController = require("../../modules/master/core/master.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

// ==============================================================================
// 1. BULK OPERATIONS (MUST BE BEFORE /:id)
// ==============================================================================
router.route('/bulk')
    .post(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.bulkCreateMasters)
    .patch(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.bulkUpdateMasters)
    .delete(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.bulkDeleteMasters);

// ==============================================================================
// 2. ROOT OPERATIONS
// ==============================================================================
router.route("/")
  .get(checkPermission(PERMISSIONS.MASTER.READ), masterController.getMasters)
  .post(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.createMaster);

// ==============================================================================
// 3. ID-BASED OPERATIONS
// ==============================================================================
router.route("/:id")
  .patch(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.updateMaster)
  .delete(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.deleteMaster);

module.exports = router;