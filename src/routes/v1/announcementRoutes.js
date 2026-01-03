// Updated announcement routes
const express = require('express');
const router = express.Router();
const announcementController = require('../../modules/notification/core/announcement.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get('/stats',
  checkPermission(PERMISSIONS.ANNOUNCEMENT.READ),
  announcementController.getAnnouncementStats
);

router.get('/search',
  checkPermission(PERMISSIONS.ANNOUNCEMENT.READ),
  announcementController.searchAnnouncements
);

router.patch('/:id/read',
  checkPermission(PERMISSIONS.ANNOUNCEMENT.MANAGE),
  announcementController.markAsRead
);

router.patch('/:id',
  checkPermission(PERMISSIONS.ANNOUNCEMENT.MANAGE),
  announcementController.updateAnnouncement
);

// Keep existing routes:
router.route('/')
  .get(checkPermission(PERMISSIONS.ANNOUNCEMENT.READ), announcementController.getAllAnnouncements)
  .post(checkPermission(PERMISSIONS.ANNOUNCEMENT.MANAGE), announcementController.createAnnouncement);

router.route('/:id')
  .delete(checkPermission(PERMISSIONS.ANNOUNCEMENT.MANAGE), announcementController.deleteAnnouncement);

module.exports = router;



// const express = require('express');
// const router = express.Router();
// const announcementController = require('../../modules/notification/core/announcement.controller');
// const authController = require('../../modules/auth/core/auth.controller');
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// router.route('/')
//   .get(checkPermission(PERMISSIONS.ANNOUNCEMENT.READ), announcementController.getAllAnnouncements)
//   .post(checkPermission(PERMISSIONS.ANNOUNCEMENT.MANAGE), announcementController.createAnnouncement);

// router.route('/:id')
//   .delete(checkPermission(PERMISSIONS.ANNOUNCEMENT.MANAGE), announcementController.deleteAnnouncement);

// module.exports = router;
