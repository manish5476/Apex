const express = require("express");
const router = express.Router();
const multer = require("multer");
const authController = require("../../modules/auth/core/auth.controller");
const userController = require("../../modules/auth/core/user.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Configure Multer (Memory Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
});

// Protect all routes (Authentication Required)
router.use(authController.protect);

// ======================================================
// 1. SELF MANAGEMENT (Accessible to ALL logged-in users)
// ======================================================

router.get("/me", userController.getMyProfile);
router.patch("/me", userController.updateMyProfile);
router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);
router.patch("/updateMyPassword", authController.updateMyPassword);
router.get("/me/permissions", userController.getMyPermissions);
// router.get('/me/permissions', protect, getMyPermissions);
router.patch('/:id/permission-overrides', protect, requirePermission('users.manage'), updatePermissionOverrides);

router.get("/me/devices", userController.getMyDevices);
router.delete("/me/devices/:sessionId", userController.revokeDevice);
router.post("/check-permission", userController.checkPermission); // Utility for frontend
router.get("/all-permissions", checkPermission(PERMISSIONS.ROLE.MANAGE), userController.getAllAvailablePermissions);
// ======================================================
// 2. ADMIN USER MANAGEMENT (Requires RBAC Permissions)
// ======================================================

// ===== READ OPERATIONS =====
router.get("/", checkPermission(PERMISSIONS.USER.READ), userController.getAllUsers);
router.get('/search', checkPermission(PERMISSIONS.USER.READ), userController.searchUsers);
router.get('/hierarchy', checkPermission(PERMISSIONS.USER.READ), userController.getOrgHierarchy);
router.get('/export', checkPermission(PERMISSIONS.USER.READ), userController.exportUsers);
router.get('/by-department/:departmentId', checkPermission(PERMISSIONS.USER.READ), userController.getUsersByDepartment);
router.get("/:id", checkPermission(PERMISSIONS.USER.READ), userController.getUser);
router.get('/:id/activity', checkPermission(PERMISSIONS.USER.MANAGE), userController.getUserActivity);

// ===== WRITE OPERATIONS =====
router.post("/", checkPermission(PERMISSIONS.USER.MANAGE), userController.createUser);
router.patch("/:id", checkPermission(PERMISSIONS.USER.MANAGE), userController.updateUser);
router.delete("/:id", checkPermission(PERMISSIONS.USER.MANAGE), userController.deleteUser);
router.patch(
  "/:id/photo",
  checkPermission(PERMISSIONS.USER.MANAGE),
  upload.single("photo"),
  userController.uploadUserPhotoByAdmin
);
router.patch("/:id/password", checkPermission(PERMISSIONS.USER.MANAGE), userController.adminUpdatePassword);

// ===== STATUS MANAGEMENT =====
router.patch('/:id/activate', checkPermission(PERMISSIONS.USER.MANAGE), userController.activateUser);
router.patch('/:id/deactivate', checkPermission(PERMISSIONS.USER.MANAGE), userController.deactivateUser);
router.post("/toggle-block", checkPermission(PERMISSIONS.USER.MANAGE), userController.toggleUserBlock);
router.post("/bulk-status", checkPermission(PERMISSIONS.USER.MANAGE), userController.bulkUpdateStatus);

module.exports = router;