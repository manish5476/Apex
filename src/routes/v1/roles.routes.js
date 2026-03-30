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
 */
router.get(
  "/permissions",
  checkPermission(PERMISSIONS.ROLE.MANAGE),
  roleController.getAvailablePermissions
);

/**
 * POST /api/v1/roles/assign
 * Assign a role to a single user
 */
router.post(
  "/assign",
  checkPermission(PERMISSIONS.ROLE.MANAGE),
  roleController.assignRoleToUser
);

/**
 * POST /api/v1/roles/assign-bulk
 * Assign a role to multiple users at once
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
   */
  .get(
    checkPermission(PERMISSIONS.ROLE.MANAGE),
    roleController.getRoles
  )
  /**
   * POST /api/v1/roles
   * Create a new role
   * isSuperAdmin roles restricted to owners only (enforced in controller)
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
   */
  .get(
    checkPermission(PERMISSIONS.ROLE.MANAGE),
    roleController.getRole
  )
  /**
   * PATCH /api/v1/roles/:id
   * Update role name / permissions / flags
   * Emits permissions:updated socket event to role room if permissions changed
   */
  .patch(
    checkPermission(PERMISSIONS.ROLE.MANAGE),
    roleController.updateRole
  )
  /**
   * DELETE /api/v1/roles/:id
   * Delete role — blocked if any users are assigned
   */
  .delete(
    checkPermission(PERMISSIONS.ROLE.MANAGE),
    roleController.deleteRole
  );

module.exports = router;
// const express = require("express");
// const router = express.Router();
// const roleController = require("../../modules/auth/core/role.controller");
// const { protect, restrictToSuperAdmin } = require("../../core/middleware/auth.middleware");
// const { checkPermission, checkIsOwner } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// // All routes require a valid session
// router.use(protect);

// // ── What permissions map here ─────────────────────────────
// //
// //  PERMISSIONS.ROLE.MANAGE  →  "role:manage"
// //  checkPermission()        →  allows isOwner/isSuperAdmin automatically
// //  checkIsOwner()           →  owner-exclusive actions (super admin roles)
// //
// // ─────────────────────────────────────────────────────────

// // Available permissions for UI dropdowns
// router.get(
//   "/permissions",
//   checkPermission(PERMISSIONS.ROLE.MANAGE),
//   roleController.getAvailablePermissions
// );

// // Assign a role to a user
// router.post(
//   "/assign",
//   checkPermission(PERMISSIONS.ROLE.MANAGE),
//   roleController.assignRoleToUser
// );

// // CRUD
// router.route("/")
//   .get(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.getRoles)
//   .post(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.createRole);

// router.route("/:id")
//   .get(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.getRole)
//   .patch(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.updateRole)
//   .delete(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.deleteRole);

// module.exports = router;

// // // routes/v1/roleRoutes.js
// // const express = require("express");
// // const router = express.Router();
// // const roleController = require("../../modules/auth/core/role.controller");
// // const authController = require("../../modules/auth/core/auth.controller");
// // const { checkPermission } = require("../../core/middleware/permission.middleware");
// // const { PERMISSIONS } = require("../../config/permissions");

// // router.use(authController.protect);

// // // Get available permissions (for UI dropdowns)
// // router.get(
// //   "/permissions",
// //   checkPermission(PERMISSIONS.ROLE.MANAGE),
// //   roleController.getAvailablePermissions
// // );

// // // Assign role to user (owners/super admins only)
// // router.post(
// //   "/assign",
// //   checkPermission(PERMISSIONS.ROLE.MANAGE),
// //   roleController.assignRoleToUser
// // );

// // // CRUD operations - owners/super admins only
// // router.route("/")
// //   .get(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.getRoles)
// //   .post(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.createRole);

// // router.route("/:id")
// //   .get(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.getRole)
// //   .patch(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.updateRole)
// //   .delete(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.deleteRole);

// // module.exports = router;
