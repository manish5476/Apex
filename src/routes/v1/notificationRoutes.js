const express = require("express");
const router = express.Router();
const notificationController = require("../../controllers/notificationController");
const authController = require("../../controllers/authController");

router.use(authController.protect);

// Badge Count (Lightweight)
router.get("/unread-count", notificationController.getUnreadCount);

// Global Actions
router.patch("/mark-all-read", notificationController.markAllRead);
router.delete("/clear-all", notificationController.clearAll);

// CRUD
router.route("/")
  .get(notificationController.getMyNotifications);

router.route("/:id")
  .patch(notificationController.markAsRead)
  .delete(notificationController.deleteNotification);

module.exports = router;