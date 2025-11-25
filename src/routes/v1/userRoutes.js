const express = require("express");
const multer = require("multer");
const authController = require("../../controllers/authController");
const userController = require("../../controllers/userController");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, });
const router = express.Router();
router.use(authController.protect);

// --- Logged-in user ---
router.get("/me", userController.getMyProfile);
router.patch("/me", userController.updateMyProfile);
router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto);
router.use(authController.restrictTo("manage_users"));
router.get("/", userController.getAllUsers);
router.post("/", userController.createUser);
router.patch("/:id", userController.updateUser);
router.patch("/:id/password", userController.adminUpdatePassword);
router.delete("/:id", userController.deleteUser);
module.exports = router;

