// routes/v1/roleRoutes.js
const express = require("express");
const router = express.Router();
const roleController = require("../../controllers/roleControllers");
const authController = require("@modules/auth/core/auth.controller");
const {
    checkPermission,
    checkIsOwner,
    checkIsSuperAdmin,
} = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// Get available permissions (for UI dropdowns)
router.get(
    "/permissions",
    checkPermission(PERMISSIONS.ROLE.MANAGE),
    roleController.getAvailablePermissions,
);

// Assign role to user (owners/super admins only)
router.post("/assign", checkIsSuperAdmin(), roleController.assignRoleToUser);

// CRUD operations - owners/super admins only
router
    .route("/")
    .get(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.getRoles)
    .post(checkIsSuperAdmin(), roleController.createRole);

router
    .route("/:id")
    .get(checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.getRole)
    .patch(checkIsSuperAdmin(), roleController.updateRole)
    .delete(checkIsSuperAdmin(), roleController.deleteRole);

module.exports = router;

// // routes/v1/roleRoutes.js
// const express = require("express");
// const router = express.Router();
// const roleController = require("../../controllers/roleControllers");
// const authController = require("@modules/auth/core/auth.controller");
// const {
//     checkPermission,
//     checkIsOwner,
//     checkIsSuperAdmin,
// } = require("../../middleware/permissionMiddleware");

// router.use(authController.protect);

// // Get available permissions (for UI dropdowns)
// router.get(
//     "/permissions",
//     checkPermission("role:manage"),
//     roleController.getAvailablePermissions,
// );

// // Assign role to user (owners/super admins only)
// router.post("/assign", checkIsSuperAdmin(), roleController.assignRoleToUser);

// // CRUD operations - owners/super admins only
// router
//     .route("/")
//     .get(checkPermission("role:manage"), roleController.getRoles)
//     .post(checkIsSuperAdmin(), roleController.createRole);

// router
//     .route("/:id")
//     .get(checkPermission("role:manage"), roleController.getRole)
//     .patch(checkIsSuperAdmin(), roleController.updateRole)
//     .delete(checkIsSuperAdmin(), roleController.deleteRole);

// module.exports = router;
