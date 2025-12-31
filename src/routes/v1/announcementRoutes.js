const express = require('express');
const router = express.Router();
const announcementController = require('../../controllers/announcementController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.route('/')
  .get(checkPermission(PERMISSIONS.ANNOUNCEMENT.READ), announcementController.getAllAnnouncements)
  .post(checkPermission(PERMISSIONS.ANNOUNCEMENT.MANAGE), announcementController.createAnnouncement);

router.route('/:id')
  .delete(checkPermission(PERMISSIONS.ANNOUNCEMENT.MANAGE), announcementController.deleteAnnouncement);

module.exports = router;
