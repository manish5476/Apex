// src/modules/notification/core/notification.routes.js
const express = require("express");
const router = express.Router();
const notificationController = require("../../modules/notification/core/notification.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require('../../config/permissions');

// Protect all routes globally
router.use(authController.protect);

// ==============================================================================
// 1. STATIC ACTIONS
// ==============================================================================
router.get("/stats", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getNotificationStats);
router.get("/unread-count", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getUnreadCount);
router.get("/my-notifications", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getMyNotifications);

// Bulk Updates
router.patch("/mark-read", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.markMultipleAsRead);
router.patch("/mark-all-read", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.markAllRead);
router.patch("/read-all", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.markAllRead);

// Deletions
router.delete("/clear-all", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.clearAll);

// ==============================================================================
// 2. ROOT ROUTES
// ==============================================================================
router.route("/")
  .get(checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getMyNotifications);

// ==============================================================================
// 3. ID-BASED ROUTES
// ==============================================================================
router.route("/:id")
  .get(checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getNotification)
  .patch(checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.markAsRead)
  .delete(checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.deleteNotification);

router.patch("/:id/read", checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.markAsRead);

module.exports = router;
