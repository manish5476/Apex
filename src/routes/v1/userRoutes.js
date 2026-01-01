const express = require("express");
const router = express.Router();
const multer = require("multer");
const authController = require("@modules/auth/core/auth.controller");
const userController = require("../../controllers/userController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, });

router.use(authController.protect);

// ======================================================
// 1. SELF MANAGEMENT (Logged in user)
// ======================================================
router.get("/me", userController.getMyProfile);
router.patch("/me", userController.updateMyProfile);
router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);
router
  .route('/:id/photo')
  .patch(
    authController.protect,
    authController.restrictTo('superadmin'),
    upload.single("photo"),
    userController.uploadUserPhotoByAdmin
  );
// ======================================================
// 2. USER MANAGEMENT (Admin)
// ======================================================
router.get('/search', checkPermission(PERMISSIONS.USER.READ), userController.searchUsers);
router.patch('/:id/deactivate', checkPermission(PERMISSIONS.USER.MANAGE), userController.deactivateUser);
router.patch('/:id/activate', checkPermission(PERMISSIONS.USER.MANAGE), userController.activateUser);
router.get('/:id/activity', checkPermission(PERMISSIONS.USER.MANAGE), userController.getUserActivity);
router.patch("/:id/password", checkPermission(PERMISSIONS.USER.MANAGE), userController.adminUpdatePassword);
router.patch("/updateMyPassword", authController.updateMyPassword);
router.route("/")
  .get(checkPermission(PERMISSIONS.USER.READ), userController.getAllUsers)
  .post(checkPermission(PERMISSIONS.USER.MANAGE), userController.createUser);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.USER.READ), userController.getUser) 
  .patch(checkPermission(PERMISSIONS.USER.MANAGE), userController.updateUser)
  .delete(checkPermission(PERMISSIONS.USER.MANAGE), userController.deleteUser);

module.exports = router;
