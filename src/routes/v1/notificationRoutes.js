// Updated notification routes
const express = require("express");
const router = express.Router();
const notificationController = require("../../modules/notification/core/notification.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require('../../config/permissions');

router.use(authController.protect);

// Add these missing routes:
router.get("/stats",
  checkPermission(PERMISSIONS.NOTIFICATION.READ),
  notificationController.getNotificationStats
);

router.patch("/mark-read",
  checkPermission(PERMISSIONS.NOTIFICATION.MANAGE),
  notificationController.markMultipleAsRead
);

// Keep existing routes:
router.get("/unread-count",
  checkPermission(PERMISSIONS.NOTIFICATION.READ),
  notificationController.getUnreadCount
);

router.patch("/mark-all-read",
  checkPermission(PERMISSIONS.NOTIFICATION.MANAGE),
  notificationController.markAllRead
);

router.delete("/clear-all",
  checkPermission(PERMISSIONS.NOTIFICATION.MANAGE),
  notificationController.clearAll
);

router.route("/")
  .get(checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getMyNotifications)
  .post(checkPermission(PERMISSIONS.NOTIFICATION.MANAGE), notificationController.createNotification); // ADD THIS

router.route("/:id")
  .get(checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getNotification) // ADD THIS
  .patch(checkPermission(PERMISSIONS.NOTIFICATION.MANAGE), notificationController.markAsRead)
  .delete(checkPermission(PERMISSIONS.NOTIFICATION.MANAGE), notificationController.deleteNotification);

module.exports = router;













// const express = require("express");
// const router = express.Router();
// const notificationController = require("../../modules/notification/core/notification.controller");
// const authController = require("../../modules/auth/core/auth.controller");
// const { checkPermission, } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require('../../config/permissions');

// router.use(authController.protect);
// // Add permissions to notification routes:
// router.get("/unread-count",
//   checkPermission(PERMISSIONS.NOTIFICATION.READ),
//   notificationController.getUnreadCount
// );

// router.patch("/mark-all-read",
//   checkPermission(PERMISSIONS.NOTIFICATION.MANAGE),
//   notificationController.markAllRead
// );

// router.delete("/clear-all",
//   checkPermission(PERMISSIONS.NOTIFICATION.MANAGE),
//   notificationController.clearAll
// );

// router.route("/")
//   .get(checkPermission(PERMISSIONS.NOTIFICATION.READ), notificationController.getMyNotifications);

// router.route("/:id")
//   .patch(checkPermission(PERMISSIONS.NOTIFICATION.MANAGE), notificationController.markAsRead)
//   .delete(checkPermission(PERMISSIONS.NOTIFICATION.MANAGE), notificationController.deleteNotification);

// // // Badge Count (Lightweight)
// // router.get("/unread-count", notificationController.getUnreadCount);

// // // Global Actions
// // router.patch("/mark-all-read", notificationController.markAllRead);
// // router.delete("/clear-all", notificationController.clearAll);

// // // CRUD
// // router.route("/")
// //   .get(notificationController.getMyNotifications);

// // router.route("/:id")
// //   .patch(notificationController.markAsRead)
// //   .delete(notificationController.deleteNotification);

// module.exports = router;