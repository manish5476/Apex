const express = require("express");
const multer = require("multer");
const authController = require("../../controllers/authController");
const userController = require("../../controllers/userController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = express.Router();

router.use(authController.protect);

// --- Logged-in user ---
router.get("/me", userController.getMyProfile);
router.patch("/me", userController.updateMyProfile);
router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);

// --- Admin-only operations ---
router.use(authController.restrictTo("manage_users"));

router.get("/", userController.getAllUsers);
router.post("/", userController.createUser);
router.patch("/:id", userController.updateUser);
router.patch("/:id/password", userController.adminUpdatePassword);
router.delete("/:id", userController.deleteUser);

module.exports = router;


// const express = require("express");
// const userController = require("../../controllers/userController");
// const authController = require("../../controllers/authController");

// const router = express.Router();

// // Self actions
// router.get("/me", authController.protect, userController.getMe);
// router.patch("/me", authController.protect, userController.updateMe);

// // Admin-only actions
// router.use(authController.protect);
// router.use(authController.restrictTo("manage_users", "superadmin"));

// router.get("/", userController.getAllUsers);
// router.post("/", userController.createUser);
// router.patch("/:id", userController.updateUser);
// router.patch("/:id/update-password", userController.updateUserPassword);
// router.delete("/:id", userController.deleteUser);

// module.exports = router;


// // // src/routes/userRoutes.js
// // const express = require("express");
// // const multer = require("multer");
// // const authController = require("../../controllers/authController");
// // const userController = require("../../controllers/userController");

// // const upload = multer({
// //   storage: multer.memoryStorage(),
// //   limits: { fileSize: 5 * 1024 * 1024 },
// // }); // 5MB

// // const router = express.Router();

// // router.use(authController.protect);

// // router.get("/me", userController.getMyProfile);
// // router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto,);

// // module.exports = router;
