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
    /** POST /bulk @payload { items* (array of { type, code, name }) } */
    .post(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.bulkCreateMasters)
    /** PATCH /bulk @payload { items* (array of { id, updates }) } */
    .patch(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.bulkUpdateMasters)
    /** DELETE /bulk @payload { ids* (array) } */
    .delete(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.bulkDeleteMasters);

// ==============================================================================
// 2. ROOT OPERATIONS
// ==============================================================================
router.route("/")
  /** GET / @query { type, status, page, limit, sort, etc } @payload none */
  .get(checkPermission(PERMISSIONS.MASTER.READ), masterController.getMasters)
  /** POST / @payload { type*, code*, name*, description, metadata } */
  .post(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.createMaster);

// ==============================================================================
// 3. ID-BASED OPERATIONS
// ==============================================================================
router.route("/:id")
  /** PATCH /:id @params { id } @payload { name, description, isActive, metadata, etc } */
  .patch(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.updateMaster)
  /** DELETE /:id @params { id } @payload none */
  .delete(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.deleteMaster);

module.exports = router;