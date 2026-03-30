// Updated announcement routes
const express = require('express');
const router = express.Router();
const announcementController = require('../../modules/notification/core/announcement.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

router.get('/stats', checkPermission(PERMISSIONS.ANNOUNCEMENT.READ), announcementController.getAnnouncementStats);
router.get('/search', checkPermission(PERMISSIONS.ANNOUNCEMENT.READ), announcementController.searchAnnouncements);
router.route('/')
  .get(checkPermission(PERMISSIONS.ANNOUNCEMENT.READ), announcementController.getAllAnnouncements)
  .post(checkPermission(PERMISSIONS.ANNOUNCEMENT.MANAGE), announcementController.createAnnouncement);
router.patch('/:id/read', checkPermission(PERMISSIONS.ANNOUNCEMENT.READ), announcementController.markAsRead);

router.route('/:id')
  .patch(checkPermission(PERMISSIONS.ANNOUNCEMENT.MANAGE), announcementController.updateAnnouncement)
  .delete(checkPermission(PERMISSIONS.ANNOUNCEMENT.MANAGE), announcementController.deleteAnnouncement);

module.exports = router;