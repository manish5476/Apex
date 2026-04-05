'use strict';

const express = require("express");
const router = express.Router();
const roleController = require("../../modules/auth/core/role.controller");
const { protect } = require("../../core/middleware/auth.middleware");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// All routes require authentication
router.use(protect);

// ======================================================
// STATIC ROUTES — must be before /:id
// ======================================================

/**
 * GET  /api/v1/roles/permissions
 * Available permission tags for UI dropdowns
 * Filtered by owner/superAdmin status automatically in controller
 * @payload none
 */
router.get(
  "/permissions",
  checkPermission(PERMISSIONS.ROLE.MANAGE),
  roleController.getAvailablePermissions
);

/**
 * POST /api/v1/roles/assign
 * Assign a role to a single user
 * @payload { userId*, roleId* }
 */
router.post(
  "/assign",
  checkPermission(PERMISSIONS.ROLE.MANAGE),
  roleController.assignRoleToUser
);

/**
 * POST /api/v1/roles/assign-bulk
 * Assign a role to multiple users at once
 * @payload { userIds* (array), roleId* }
 */
router.post(
  "/assign-bulk",
  checkPermission(PERMISSIONS.ROLE.MANAGE),
  roleController.assignRoleBulk
);

// ======================================================
// COLLECTION ROUTES
// ======================================================

router.route("/")
  /**
   * GET  /api/v1/roles
   * List all roles (with user counts)
   * SuperAdmin roles hidden from non-owners
   * @payload none
   */
  .get(
    checkPermission(PERMISSIONS.ROLE.MANAGE),
    roleController.getRoles
  )
  /**
   * POST /api/v1/roles
   * Create a new role
   * isSuperAdmin roles restricted to owners only (enforced in controller)
   * @payload { name*, permissions (array), isDefault, isSuperAdmin }
   */
  .post(
    checkPermission(PERMISSIONS.ROLE.MANAGE),
    roleController.createRole
  );

// ======================================================
// DYNAMIC /:id ROUTES — after all static paths
// ======================================================

router.route("/:id")
  /**
   * GET  /api/v1/roles/:id
   * Single role + assigned users list
   * @payload none
   */
  .get(
    checkPermission(PERMISSIONS.ROLE.MANAGE),
    roleController.getRole
  )
  /**
   * PATCH /api/v1/roles/:id
   * Update role name / permissions / flags
   * Emits permissions:updated socket event to role room if permissions changed
   * @payload { name, permissions (array), isSuperAdmin, isDefault }
   */
  .patch(
    checkPermission(PERMISSIONS.ROLE.MANAGE),
    roleController.updateRole
  )
  /**
   * DELETE /api/v1/roles/:id
   * Delete role — blocked if any users are assigned
   * @payload none
   */
  .delete(
    checkPermission(PERMISSIONS.ROLE.MANAGE),
    roleController.deleteRole
  );

module.exports = router;
