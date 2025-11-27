// src/routes/v1/notificationRoutes.js
const express = require("express");
const notificationController = require("../../controllers/notificationController");
const authController = require("../../controllers/authController");

const router = express.Router();

// Protect all routes
router.use(authController.protect);

// Route to get all notifications for current user
router.get(
  "/my-notifications",
  notificationController.getMyNotifications
);

router.patch('/:id/read', notificationController.markAsRead);
router.patch('/read-all', notificationController.markAllRead);


module.exports = router;
