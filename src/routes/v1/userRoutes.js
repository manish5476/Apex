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
// const express = require("express");
// const router = express.Router();
// const multer = require("multer");
// const authController = require("../../modules/auth/core/auth.controller");
// const userController = require("../../modules/auth/core/user.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// // Configure Multer (Memory Storage)
// const upload = multer({ 
//   storage: multer.memoryStorage(), 
//   limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
// });

// // Protect all routes
// router.use(authController.protect);

// // ======================================================
// // 1. SELF MANAGEMENT (Logged in user)
// // ======================================================

// /**
//  * @route   GET /api/v1/users/me
//  * @desc    Get current user profile
//  * @access  Private
//  */
// router.get("/me", userController.getMyProfile);

// /**
//  * @route   PATCH /api/v1/users/me
//  * @desc    Update current user profile
//  * @access  Private
//  */
// router.patch("/me", userController.updateMyProfile);

// /**
//  * @route   PATCH /api/v1/users/me/photo
//  * @desc    Upload profile photo
//  * @access  Private
//  */
// router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);

// /**
//  * @route   PATCH /api/v1/users/updateMyPassword
//  * @desc    Update password (when logged in)
//  * @access  Private
//  */
// router.patch("/updateMyPassword", authController.updateMyPassword);

// /**
//  * @route   GET /api/v1/users/me/permissions
//  * @desc    Get current user permissions
//  * @access  Private
//  */
// router.get("/me/permissions", userController.getMyPermissions);

// /**
//  * @route   GET /api/v1/users/me/devices
//  * @desc    Get user's active devices/sessions
//  * @access  Private
//  */
// router.get("/me/devices", userController.getMyDevices);

// /**
//  * @route   DELETE /api/v1/users/me/devices/:sessionId
//  * @desc    Revoke a specific device session
//  * @access  Private
//  */
// router.delete("/me/devices/:sessionId", userController.revokeDevice);

// // ======================================================
// // 2. ADMIN USER MANAGEMENT
// // ======================================================

// // ===== READ OPERATIONS =====

// /**
//  * @route   GET /api/v1/users
//  * @desc    Get all users (with filters)
//  * @access  Private (Admin/HR)
//  */
// router.get("/", checkPermission(PERMISSIONS.USER.READ), userController.getAllUsers);

// /**
//  * @route   GET /api/v1/users/search
//  * @desc    Search users
//  * @access  Private (Admin/HR)
//  */
// router.get('/search', checkPermission(PERMISSIONS.USER.READ), userController.searchUsers);

// /**
//  * @route   GET /api/v1/users/hierarchy
//  * @desc    Get organization reporting hierarchy
//  * @access  Private (Admin/HR)
//  */
// router.get('/hierarchy', checkPermission(PERMISSIONS.USER.READ), userController.getOrgHierarchy);

// /**
//  * @route   GET /api/v1/users/export
//  * @desc    Export users data (CSV/JSON)
//  * @access  Private (Admin/HR)
//  */
// router.get('/export', checkPermission(PERMISSIONS.USER.READ), userController.exportUsers);

// /**
//  * @route   GET /api/v1/users/by-department/:departmentId
//  * @desc    Get users by department
//  * @access  Private (Admin/HR)
//  */
// router.get('/by-department/:departmentId', checkPermission(PERMISSIONS.USER.READ), userController.getUsersByDepartment);

// /**
//  * @route   GET /api/v1/users/:id
//  * @desc    Get user by ID
//  * @access  Private (Admin/HR)
//  */
// router.get("/:id", checkPermission(PERMISSIONS.USER.READ), userController.getUser);

// /**
//  * @route   GET /api/v1/users/:id/activity
//  * @desc    Get user activity logs
//  * @access  Private (Admin/HR)
//  */
// router.get('/:id/activity', checkPermission(PERMISSIONS.USER.MANAGE), userController.getUserActivity);

// // ===== WRITE OPERATIONS =====

// /**
//  * @route   POST /api/v1/users
//  * @desc    Create new user (with leave balance)
//  * @access  Private (Admin/HR)
//  */
// router.post("/", checkPermission(PERMISSIONS.USER.MANAGE), userController.createUser);

// /**
//  * @route   PATCH /api/v1/users/:id
//  * @desc    Update user
//  * @access  Private (Admin/HR)
//  */
// router.patch("/:id", checkPermission(PERMISSIONS.USER.MANAGE), userController.updateUser);

// /**
//  * @route   DELETE /api/v1/users/:id
//  * @desc    Soft delete user
//  * @access  Private (Admin only)
//  */
// router.delete("/:id", checkPermission(PERMISSIONS.USER.MANAGE), userController.deleteUser);

// /**
//  * @route   PATCH /api/v1/users/:id/photo
//  * @desc    Upload user photo (admin)
//  * @access  Private (Admin only)
//  */
// router.patch(
//   "/:id/photo", 
//   checkPermission(PERMISSIONS.USER.MANAGE), 
//   upload.single("photo"), 
//   userController.uploadUserPhotoByAdmin
// );

// /**
//  * @route   PATCH /api/v1/users/:id/password
//  * @desc    Admin update user password
//  * @access  Private (Admin only)
//  */
// router.patch("/:id/password", checkPermission(PERMISSIONS.USER.MANAGE), userController.adminUpdatePassword);

// // ===== STATUS MANAGEMENT =====

// /**
//  * @route   PATCH /api/v1/users/:id/activate
//  * @desc    Activate user
//  * @access  Private (Admin only)
//  */
// router.patch('/:id/activate', checkPermission(PERMISSIONS.USER.MANAGE), userController.activateUser);

// /**
//  * @route   PATCH /api/v1/users/:id/deactivate
//  * @desc    Deactivate user
//  * @access  Private (Admin only)
//  */
// router.patch('/:id/deactivate', checkPermission(PERMISSIONS.USER.MANAGE), userController.deactivateUser);

// /**
//  * @route   POST /api/v1/users/toggle-block
//  * @desc    Toggle user block status (kill switch)
//  * @access  Private (Admin only)
//  */
// router.post("/toggle-block", checkPermission(PERMISSIONS.USER.MANAGE), userController.toggleUserBlock);

// /**
//  * @route   POST /api/v1/users/check-permission
//  * @desc    Check if user has specific permission
//  * @access  Private
//  */
// router.post("/check-permission", userController.checkPermission);

// /**
//  * @route   POST /api/v1/users/bulk-status
//  * @desc    Bulk update user statuses
//  * @access  Private (Admin only)
//  */
// router.post("/bulk-status", checkPermission(PERMISSIONS.USER.MANAGE), userController.bulkUpdateStatus);

// module.exports = router;






// // const express = require("express");
// // const router = express.Router();
// // const multer = require("multer");
// // const authController = require("../../modules/auth/core/auth.controller");
// // const userController = require("../../modules/auth/core/user.controller");
// // const { checkPermission } = require("../../core/middleware/permission.middleware");
// // const { PERMISSIONS } = require("../../config/permissions"); // Ensure this file exists

// // // Configure Multer (Memory Storage)
// // const upload = multer({ 
// //   storage: multer.memoryStorage(), 
// //   limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
// // });

// // // Protect all routes
// // router.use(authController.protect);

// // // ======================================================
// // // 1. SELF MANAGEMENT (Logged in user)
// // // ======================================================
// // router.get("/me", userController.getMyProfile);
// // router.patch("/me", userController.updateMyProfile);
// // router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);
// // router.patch("/updateMyPassword", authController.updateMyPassword);

// // // Check my own permissions (Frontend Helper)
// // router.get("/me/permissions", userController.getMyPermissions);
// // // Admin toggle (Placed here as per your request, usually admin)
// // router.patch("/togglestatus", userController.toggleUserBlock); 

// // // ======================================================
// // // 2. USER MANAGEMENT (Admin)
// // // ======================================================

// // // Specialized Admin Actions
// // router.get('/search', checkPermission(PERMISSIONS.USER.READ), userController.searchUsers);
// // router.get('/hierarchy', checkPermission(PERMISSIONS.USER.READ), userController.getOrgHierarchy); // New!

// // router.patch('/:id/deactivate', checkPermission(PERMISSIONS.USER.MANAGE), userController.deactivateUser);
// // router.patch('/:id/activate', checkPermission(PERMISSIONS.USER.MANAGE), userController.activateUser);
// // router.get('/:id/activity', checkPermission(PERMISSIONS.USER.MANAGE), userController.getUserActivity);
// // router.patch("/:id/password", checkPermission(PERMISSIONS.USER.MANAGE), userController.adminUpdatePassword);

// // router
// //   .route('/:id/photo')
// //   .patch(
// //     authController.restrictTo('superadmin'),
// //     upload.single("photo"),
// //     userController.uploadUserPhotoByAdmin
// //   );

// // // CRUD Operations
// // router.route("/")
// //   .get(checkPermission(PERMISSIONS.USER.READ), userController.getAllUsers)
// //   .post(checkPermission(PERMISSIONS.USER.MANAGE), userController.createUser); // Uses Transactional Logic

// // router.route("/:id")
// //   .get(checkPermission(PERMISSIONS.USER.READ), userController.getUser) 
// //   .patch(checkPermission(PERMISSIONS.USER.MANAGE), userController.updateUser) // Uses Nested Update Logic
// //   .delete(checkPermission(PERMISSIONS.USER.MANAGE), userController.deleteUser);

// // module.exports = router;




// // // const express = require("express");
// // // const router = express.Router();
// // // const multer = require("multer");
// // // const authController = require("../../modules/auth/core/auth.controller");
// // // const userController = require("../../modules/auth/core/user.controller");
// // // const { checkPermission } = require("../../core/middleware/permission.middleware");
// // // const { PERMISSIONS } = require("../../config/permissions");

// // // const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, });

// // // router.use(authController.protect);

// // // // ======================================================
// // // // 1. SELF MANAGEMENT (Logged in user)
// // // // ======================================================
// // // router.get("/me", userController.getMyProfile);
// // // router.patch("/me", userController.updateMyProfile);
// // // router.patch("/togglestatus", userController.toggleUserBlock);
// // // router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);
// // // router
// // //   .route('/:id/photo')
// // //   .patch(
// // //     authController.protect,
// // //     authController.restrictTo('superadmin'),
// // //     upload.single("photo"),
// // //     userController.uploadUserPhotoByAdmin
// // //   );
// // //   router.get('/hierarchy', checkPermission(PERMISSIONS.USER.READ), userController.getOrgHierarchy); // New!

// // // // ======================================================
// // // // 2. USER MANAGEMENT (Admin)
// // // // ======================================================
// // // router.get('/search', checkPermission(PERMISSIONS.USER.READ), userController.searchUsers);
// // // router.patch('/:id/deactivate', checkPermission(PERMISSIONS.USER.MANAGE), userController.deactivateUser);
// // // router.patch('/:id/activate', checkPermission(PERMISSIONS.USER.MANAGE), userController.activateUser);
// // // router.get('/:id/activity', checkPermission(PERMISSIONS.USER.MANAGE), userController.getUserActivity);
// // // router.patch("/:id/password", checkPermission(PERMISSIONS.USER.MANAGE), userController.adminUpdatePassword);
// // // router.patch("/updateMyPassword", authController.updateMyPassword);
// // // router.route("/")
// // //   .get(checkPermission(PERMISSIONS.USER.READ), userController.getAllUsers)
// // //   .post(checkPermission(PERMISSIONS.USER.MANAGE), userController.createUser);

// // // router.route("/:id")
// // //   .get(checkPermission(PERMISSIONS.USER.READ), userController.getUser) 
// // //   .patch(checkPermission(PERMISSIONS.USER.MANAGE), userController.updateUser)
// // //   .delete(checkPermission(PERMISSIONS.USER.MANAGE), userController.deleteUser);

// // // module.exports = router;

// // // // const express = require("express");
// // // // const router = express.Router();
// // // // const multer = require("multer");
// // // // const authController = require("../../modules/auth/core/auth.controller");
// // // // const userController = require("../../modules/auth/core/user.controller");
// // // // const { checkPermission } = require("../../core/middleware/permission.middleware");
// // // // const { PERMISSIONS } = require("../../config/permissions");

// // // // const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, });

// // // // router.use(authController.protect);

// // // // // ======================================================
// // // // // 1. SELF MANAGEMENT (Logged in user)
// // // // // ======================================================
// // // // router.get("/me", userController.getMyProfile);
// // // // router.patch("/me", userController.updateMyProfile);
// // // // router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);
// // // // router
// // // //   .route('/:id/photo')
// // // //   .patch(
// // // //     authController.protect,
// // // //     authController.restrictTo('superadmin'),
// // // //     upload.single("photo"),
// // // //     userController.uploadUserPhotoByAdmin
// // // //   );
// // // // // ======================================================
// // // // // 2. USER MANAGEMENT (Admin)
// // // // // ======================================================
// // // // router.get('/search', checkPermission(PERMISSIONS.USER.READ), userController.searchUsers);
// // // // router.patch('/:id/deactivate', checkPermission(PERMISSIONS.USER.MANAGE), userController.deactivateUser);
// // // // router.patch('/:id/activate', checkPermission(PERMISSIONS.USER.MANAGE), userController.activateUser);
// // // // router.get('/:id/activity', checkPermission(PERMISSIONS.USER.MANAGE), userController.getUserActivity);
// // // // router.patch("/:id/password", checkPermission(PERMISSIONS.USER.MANAGE), userController.adminUpdatePassword);
// // // // router.patch("/updateMyPassword", authController.updateMyPassword);
// // // // router.route("/")
// // // //   .get(checkPermission(PERMISSIONS.USER.READ), userController.getAllUsers)
// // // //   .post(checkPermission(PERMISSIONS.USER.MANAGE), userController.createUser);

// // // // router.route("/:id")
// // // //   .get(checkPermission(PERMISSIONS.USER.READ), userController.getUser) 
// // // //   .patch(checkPermission(PERMISSIONS.USER.MANAGE), userController.updateUser)
// // // //   .delete(checkPermission(PERMISSIONS.USER.MANAGE), userController.deleteUser);

// // // // module.exports = router;
