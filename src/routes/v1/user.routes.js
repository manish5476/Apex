'use strict';

const express = require('express');
const router  = express.Router();

const authController = require('../../modules/auth/core/auth.controller');
const userController = require('../../modules/auth/core/user.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS }     = require('../../config/permissions');
const { upload }          = require('../../core/middleware/upload.middleware'); // central middleware

// All user routes require authentication
router.use(authController.protect);

// ======================================================
// 1. SELF MANAGEMENT  (/me/...)
// These must be declared BEFORE /:id routes
// ======================================================
router.get('/me',              userController.getMyProfile);
router.patch('/me',            userController.updateMyProfile);
router.post('/me/photo',       upload.single('photo'), userController.uploadProfilePhoto);
router.get('/me/permissions',  userController.getMyPermissions);
router.get('/me/devices',      userController.getMyDevices);
router.delete('/me/devices/:sessionId', userController.revokeDevice);

// Password change lives in auth.routes.js: PATCH /auth/update-my-password
// Keeping it there keeps auth concerns in auth routes.

// ======================================================
// 2. STATIC NAMED ROUTES  (must come before /:id)
// ======================================================
router.get('/all-permissions', checkPermission(PERMISSIONS.USER.MANAGE), userController.getAllAvailablePermissions);
router.get('/search',          checkPermission(PERMISSIONS.USER.READ),   userController.searchUsers);
router.get('/hierarchy',       checkPermission(PERMISSIONS.USER.READ),   userController.getOrgHierarchy);
router.get('/export',          checkPermission(PERMISSIONS.USER.READ),   userController.exportUsers);

router.post('/check-permission', userController.checkPermission); // no extra permission needed — checks own perms
router.post('/toggle-block',   checkPermission(PERMISSIONS.USER.MANAGE), userController.toggleUserBlock);
router.post('/bulk-status',    checkPermission(PERMISSIONS.USER.MANAGE), userController.bulkUpdateStatus);

// ======================================================
// 3. ROOT CRUD
// ======================================================
router.route('/')
  .get(checkPermission(PERMISSIONS.USER.READ),   userController.getAllUsers)
  .post(checkPermission(PERMISSIONS.USER.MANAGE), userController.createUser);

// ======================================================
// 4. DYNAMIC /:id ROUTES  (always last)
// ======================================================

// Sub-resource reads (specific enough to not clash with /:id)
router.get('/by-department/:departmentId', checkPermission(PERMISSIONS.USER.READ),   userController.getUsersByDepartment);
router.get('/:id/activity',                checkPermission(PERMISSIONS.USER.MANAGE), userController.getUserActivity);
router.get('/:id',                         checkPermission(PERMISSIONS.USER.READ),   userController.getUser);

// Write actions on a specific user
router.post('/:id/photo',    checkPermission(PERMISSIONS.USER.MANAGE), upload.single('photo'), userController.uploadUserPhotoByAdmin);
router.patch('/:id/photo',   checkPermission(PERMISSIONS.USER.MANAGE), upload.single('photo'), userController.uploadUserPhotoByAdmin);

router.patch('/:id/password',             checkPermission(PERMISSIONS.USER.MANAGE), userController.adminUpdatePassword);
router.patch('/:id/activate',             checkPermission(PERMISSIONS.USER.MANAGE), userController.activateUser);
router.patch('/:id/deactivate',           checkPermission(PERMISSIONS.USER.MANAGE), userController.deactivateUser);
router.patch('/:id/permission-overrides', checkPermission(PERMISSIONS.USER.MANAGE), userController.updatePermissionOverrides);

// Generic update — MUST be last PATCH so specific patches above take priority
router.patch('/:id',  checkPermission(PERMISSIONS.USER.MANAGE), userController.updateUser);
router.delete('/:id', checkPermission(PERMISSIONS.USER.MANAGE), userController.deleteUser);

module.exports = router;


// 'use strict';

// const express = require("express");
// const router = express.Router();
// const multer = require("multer");
// const authController = require("../../modules/auth/core/auth.controller");
// const userController = require("../../modules/auth/core/user.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 5 * 1024 * 1024 }
// });

// router.use(authController.protect);

// // ======================================================
// // 1. SELF MANAGEMENT
// // ======================================================
// router.get("/me", userController.getMyProfile);
// router.patch("/me", userController.updateMyProfile);
// router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);
// router.patch("/updateMyPassword", authController.updateMyPassword);
// router.get("/me/permissions", userController.getMyPermissions);
// router.get("/me/devices", userController.getMyDevices);
// router.delete("/me/devices/:sessionId", userController.revokeDevice);

// // ======================================================
// // 2. STATIC PATH ROUTES — must come before /:id
// // ======================================================
// router.get("/", checkPermission(PERMISSIONS.USER.READ), userController.getAllUsers);
// router.get("/all-permissions", checkPermission(PERMISSIONS.USER.MANAGE), userController.getAllAvailablePermissions);
// router.get('/search', checkPermission(PERMISSIONS.USER.READ), userController.searchUsers);
// router.get('/hierarchy', checkPermission(PERMISSIONS.USER.READ), userController.getOrgHierarchy);
// router.get('/export', checkPermission(PERMISSIONS.USER.READ), userController.exportUsers);
// router.post("/check-permission", userController.checkPermission);
// router.post("/toggle-block", checkPermission(PERMISSIONS.USER.MANAGE), userController.toggleUserBlock);
// router.post("/bulk-status", checkPermission(PERMISSIONS.USER.MANAGE), userController.bulkUpdateStatus);
// router.post("/", checkPermission(PERMISSIONS.USER.MANAGE), userController.createUser);

// // ======================================================
// // 3. DYNAMIC /:id ROUTES — after all static paths
// // ======================================================
// router.get('/by-department/:departmentId', checkPermission(PERMISSIONS.USER.READ), userController.getUsersByDepartment);
// router.get('/:id/activity', checkPermission(PERMISSIONS.USER.MANAGE), userController.getUserActivity);
// router.get("/:id", checkPermission(PERMISSIONS.USER.READ), userController.getUser);

// router.patch("/:id/photo", checkPermission(PERMISSIONS.USER.MANAGE), upload.single("photo"), userController.uploadUserPhotoByAdmin);
// router.patch("/:id/password", checkPermission(PERMISSIONS.USER.MANAGE), userController.adminUpdatePassword);
// router.patch('/:id/activate', checkPermission(PERMISSIONS.USER.MANAGE), userController.activateUser);
// router.patch('/:id/deactivate', checkPermission(PERMISSIONS.USER.MANAGE), userController.deactivateUser);
// router.patch('/:id/permission-overrides', checkPermission(PERMISSIONS.USER.MANAGE), userController.updatePermissionOverrides);

// // 🛡️ Generic /:id must be LAST for PATCH
// router.patch("/:id", checkPermission(PERMISSIONS.USER.MANAGE), userController.updateUser);

// router.delete("/:id", checkPermission(PERMISSIONS.USER.MANAGE), userController.deleteUser);

// module.exports = router;