const express = require("express");
const router = express.Router();
const notificationController = require("../../controllers/notificationController");
const authController = require("../../controllers/authController");

// Notifications are fundamental to the user, typically no specific permission needed
// beyond authentication, but you could add NOTIFICATION.READ if strict.
router.use(authController.protect);

router.get("/my-notifications", notificationController.getMyNotifications);
router.patch('/:id/read', notificationController.markAsRead);
router.patch('/read-all', notificationController.markAllRead);

module.exports = router;

// // src/routes/v1/notificationRoutes.js
// const express = require("express");
// const notificationController = require("../../controllers/notificationController");
// const authController = require("../../controllers/authController");

// const router = express.Router();

// // Protect all routes
// router.use(authController.protect);

// // Route to get all notifications for current user
// router.get(
//   "/my-notifications",
//   notificationController.getMyNotifications
// );

// router.patch('/:id/read', notificationController.markAsRead);
// router.patch('/read-all', notificationController.markAllRead);


// module.exports = router;
