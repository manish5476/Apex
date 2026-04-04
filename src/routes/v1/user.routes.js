'use strict';

const express = require('express');
const router = express.Router();

const authController = require('../../modules/auth/core/auth.controller');
const userController = require('../../modules/auth/core/user.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');
const { upload } = require('../../core/middleware/upload.middleware'); // central middleware

// All user routes require authentication
router.use(authController.protect);

// ======================================================
// 1. SELF MANAGEMENT  (/me/...)
// These must be declared BEFORE /:id routes
// ======================================================

/**
 * GET /me
 * @payload none
 */
router.get('/me', userController.getMyProfile);

/**
 * PATCH /me
 * @payload { name, avatar, language, themeId, upiId, preferences.theme, preferences.notifications, employeeProfile.secondaryPhone, employeeProfile.guarantorDetails, employeeProfile.workLocation }
 */
router.patch('/me', userController.updateMyProfile);

/**
 * POST /me/photo
 * @payload { photo (file) }
 */
router.post('/me/photo', upload.single('photo'), userController.uploadProfilePhoto);

/**
 * GET /me/permissions
 * @payload none
 */
router.get('/me/permissions', userController.getMyPermissions);

/**
 * GET /me/devices
 * @payload none
 */
router.get('/me/devices', userController.getMyDevices);

/**
 * DELETE /me/devices/:sessionId
 * @params { sessionId }
 * @payload none
 */
router.delete('/me/devices/:sessionId', userController.revokeDevice);

// Password change lives in auth.routes.js: PATCH /auth/update-my-password
// Keeping it there keeps auth concerns in auth routes.

// ======================================================
// 2. STATIC NAMED ROUTES  (must come before /:id)
// ======================================================

/**
 * GET /all-permissions
 * @payload none
 */
router.get('/all-permissions', checkPermission(PERMISSIONS.USER.MANAGE), userController.getAllAvailablePermissions);

/**
 * GET /search
 * @query { q (or search) }
 * @payload none
 */
router.get('/search', checkPermission(PERMISSIONS.USER.READ), userController.searchUsers);

/**
 * GET /hierarchy
 * @query { depth }
 * @payload none
 */
router.get('/hierarchy', checkPermission(PERMISSIONS.USER.READ), userController.getOrgHierarchy);

/**
 * GET /export
 * @payload none
 */
router.get('/export', checkPermission(PERMISSIONS.USER.READ), userController.exportUsers);

/**
 * POST /check-permission
 * @payload { permission }
 */
router.post('/check-permission', userController.checkPermission); // no extra permission needed — checks own perms

/**
 * POST /toggle-block
 * @payload { userId, blockReason }
 */
router.post('/toggle-block', checkPermission(PERMISSIONS.USER.MANAGE), userController.toggleUserBlock);

/**
 * POST /bulk-status
 * @payload { userIds (array), status }
 */
router.post('/bulk-status', checkPermission(PERMISSIONS.USER.MANAGE), userController.bulkUpdateStatus);

// ======================================================
// 3. ROOT CRUD
// ======================================================
router.route('/')
  /**
   * GET /
   * @query { department, designation, reportingTo, employmentType }
   * @payload none
   */
  .get(checkPermission(PERMISSIONS.USER.READ), userController.getAllUsers)
  /**
   * POST /
   * @payload { email, phone, name, employeeProfile, attendanceConfig, branchId, etc. }
   */
  .post(checkPermission(PERMISSIONS.USER.MANAGE), userController.createUser);

// ======================================================
// 4. DYNAMIC /:id ROUTES  (always last)
// ======================================================

// Sub-resource reads (specific enough to not clash with /:id)
/**
 * GET /by-department/:departmentId
 * @params { departmentId }
 * @payload none
 */
router.get('/by-department/:departmentId', checkPermission(PERMISSIONS.USER.READ), userController.getUsersByDepartment);

/**
 * GET /:id/activity
 * @params { id }
 * @payload none
 */
router.get('/:id/activity', checkPermission(PERMISSIONS.USER.MANAGE), userController.getUserActivity);

/**
 * GET /:id
 * @params { id }
 * @payload none
 */
router.get('/:id', checkPermission(PERMISSIONS.USER.READ), userController.getUser);

// Write actions on a specific user
/**
 * POST /:id/photo
 * @params { id }
 * @payload { photo (file) }
 */
router.post('/:id/photo', checkPermission(PERMISSIONS.USER.MANAGE), upload.single('photo'), userController.uploadUserPhotoByAdmin);

/**
 * PATCH /:id/photo
 * @params { id }
 * @payload { photo (file) }
 */
router.patch('/:id/photo', checkPermission(PERMISSIONS.USER.MANAGE), upload.single('photo'), userController.uploadUserPhotoByAdmin);

/**
 * PATCH /:id/password
 * @params { id }
 * @payload { password*, passwordConfirm* }
 */
router.patch('/:id/password', checkPermission(PERMISSIONS.USER.MANAGE), userController.adminUpdatePassword);

/**
 * PATCH /:id/activate
 * @params { id }
 * @payload none
 */
router.patch('/:id/activate', checkPermission(PERMISSIONS.USER.MANAGE), userController.activateUser);

/**
 * PATCH /:id/deactivate
 * @params { id }
 * @payload none
 */
router.patch('/:id/deactivate', checkPermission(PERMISSIONS.USER.MANAGE), userController.deactivateUser);

/**
 * PATCH /:id/permission-overrides
 * @params { id }
 * @payload { grant (array), revoke (array) }
 */
router.patch('/:id/permission-overrides', checkPermission(PERMISSIONS.USER.MANAGE), userController.updatePermissionOverrides);

// Generic update — MUST be last PATCH so specific patches above take priority
/**
 * PATCH /:id
 * @params { id }
 * @payload { phone, employeeProfile, attendanceConfig, preferences, etc }
 */
router.patch('/:id', checkPermission(PERMISSIONS.USER.MANAGE), userController.updateUser);

/**
 * DELETE /:id
 * @params { id }
 * @payload none
 */
router.delete('/:id', checkPermission(PERMISSIONS.USER.MANAGE), userController.deleteUser);

module.exports = router;
