// src/routes/userRoutes.js
const express = require("express");
const multer = require("multer");
const authController = require("../../controllers/authController");
const userController = require("../../controllers/userController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}); // 5MB

const router = express.Router();

router.use(authController.protect);

router.get("/me", userController.getMyProfile);
router.patch("/me/photo", upload.single("photo"), userController.uploadProfilePhoto,);

module.exports = router;
