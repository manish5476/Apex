const express = require("express");
const router = express.Router();
const notificationController = require("../../modules/notification/core/notification.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require('../../config/permissions');

// Protect all routes globally
router.use(authController.protect);

// ==============================================================================
// 1. STATIC ACTIONS (MUST BE BEFORE /:id)
// ==============================================================================
router.get("/stats", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getNotificationStats);
router.get("/unread-count", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getUnreadCount);

// 🟢 Changed to READ so regular users can mark their own tray as read
router.patch("/mark-read", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.markMultipleAsRead);
router.patch("/mark-all-read", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.markAllRead);

// 🟢 Changed to READ so users can clear their own trays
router.delete("/clear-all", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.clearAll);

// ==============================================================================
// 2. ROOT ROUTES
// ==============================================================================
router.route("/")
  .get(checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getMyNotifications)
  // 🔴 Kept MANAGE here because creating/sending notifications is an Admin action
  .post(checkPermission(PERMISSIONS.NOTIFICATION.MANAGE), notificationController.createNotification);

// ==============================================================================
// 3. ID-BASED ROUTES
// ==============================================================================
router.route("/:id")
  .get(checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getNotification)
  // 🟢 Changed to READ so users can interact with their own specific notification
  .patch(checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.markAsRead)
  .delete(checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.deleteNotification);

module.exports = router;
