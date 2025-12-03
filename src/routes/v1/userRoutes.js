const express = require("express");
const router = express.Router();
const multer = require("multer");
const authController = require("../../controllers/authController");
const userController = require("../../controllers/userController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, });

router.use(authController.protect);

// Self Management (No permission needed, just Auth)
router.get("/me", userController.getMyProfile);
router.patch("/me", userController.updateMyProfile);
router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);

// User Management (Admin)
router.get('/search', checkPermission(PERMISSIONS.USER.READ), userController.searchUsers);
router.patch('/:id/deactivate', checkPermission(PERMISSIONS.USER.MANAGE), userController.deactivateUser);
router.patch('/:id/activate', checkPermission(PERMISSIONS.USER.MANAGE), userController.activateUser);
router.get('/:id/activity', checkPermission(PERMISSIONS.USER.MANAGE), userController.getUserActivity);
router.patch("/:id/password", checkPermission(PERMISSIONS.USER.MANAGE), userController.adminUpdatePassword);

router.route("/")
  .get(checkPermission(PERMISSIONS.USER.READ), userController.getAllUsers)
  .post(checkPermission(PERMISSIONS.USER.MANAGE), userController.createUser);

router.route("/:id")
  .patch(checkPermission(PERMISSIONS.USER.MANAGE), userController.updateUser)
  .delete(checkPermission(PERMISSIONS.USER.MANAGE), userController.deleteUser);

module.exports = router;





// const express = require("express");
// const router = express.Router();
// const userController = require("../../controllers/userController");
// const authController = require("../../controllers/authController");
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");
// const multer = require("multer");
// const upload = multer({ storage: multer.memoryStorage() });

// router.use(authController.protect);

// // Self Management (No permission needed, just Auth)
// router.get("/me", userController.getMyProfile);
// router.patch("/me", userController.updateMyProfile);
// router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);

// // Admin Actions
// router.get('/search', checkPermission(PERMISSIONS.USER.MANAGE), userController.searchUsers);
// router.patch('/:id/deactivate', checkPermission(PERMISSIONS.USER.MANAGE), userController.deactivateUser);
// router.patch('/:id/activate', checkPermission(PERMISSIONS.USER.MANAGE), userController.activateUser);
// router.get('/:id/activity', checkPermission(PERMISSIONS.USER.MANAGE), userController.getUserActivity);
// router.patch("/:id/password", checkPermission(PERMISSIONS.USER.MANAGE), userController.adminUpdatePassword);

// router.route("/")
//   .get(checkPermission(PERMISSIONS.USER.MANAGE), userController.getAllUsers)
//   .post(checkPermission(PERMISSIONS.USER.MANAGE), userController.createUser);

// router.route("/:id")
//   .patch(checkPermission(PERMISSIONS.USER.MANAGE), userController.updateUser)
//   .delete(checkPermission(PERMISSIONS.USER.MANAGE), userController.deleteUser);

// module.exports = router;

// // const express = require("express");
// // const multer = require("multer");
// // const authController = require("../../controllers/authController");
// // const userController = require("../../controllers/userController");
// // const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, });
// // const router = express.Router();
// // router.use(authController.protect);

// // // --- Logged-in user ---
// // router.get("/me", userController.getMyProfile);
// // router.patch("/me", userController.updateMyProfile);
// // router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);
// // router.use(authController.restrictTo("manage_users"));
// // router.get("/", userController.getAllUsers);
// // router.post("/", userController.createUser);
// // router.patch("/:id", userController.updateUser);
// // router.patch("/:id/password", userController.adminUpdatePassword);
// // router.delete("/:id", userController.deleteUser);

// // // admin-only routes
// // router.get('/search', authController.restrictTo('manage_users','superadmin'), userController.searchUsers);
// // router.patch('/:id/deactivate', authController.restrictTo('manage_users','superadmin'), userController.deactivateUser);
// // router.patch('/:id/activate', authController.restrictTo('manage_users','superadmin'), userController.activateUser);
// // router.get('/:id/activity', authController.restrictTo('manage_users','superadmin'), userController.getUserActivity);

// // module.exports = router;

