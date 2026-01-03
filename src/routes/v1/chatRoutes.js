const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const channelCtrl = require('../../modules/organization/core/channel.controller');
const messageCtrl = require('../../modules/notification/core/message.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

router.use(authController.protect);

router.post(
  '/upload',
  checkPermission(PERMISSIONS.CHAT.SEND),
  upload.single('file'),
  messageCtrl.uploadAttachment
);

router.post(
  '/channels',
  checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
  channelCtrl.createChannel
);

router.get(
  '/channels',
  checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
  channelCtrl.listChannels
);

router.post(
  '/channels/:channelId/members',
  checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
  channelCtrl.addMember
);

router.delete(
  '/channels/:channelId/members/:userId',
  checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
  channelCtrl.removeMember
);

router.patch(
  '/channels/:channelId/disable',
  checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
  channelCtrl.disableChannel
);

router.patch(
  '/channels/:channelId/enable',
  checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
  channelCtrl.enableChannel
);

router.get(
  '/channels/:channelId/messages',
  checkPermission(PERMISSIONS.CHAT.SEND),
  messageCtrl.getMessages
);

router.patch(
  '/messages/:messageId',
  checkPermission(PERMISSIONS.CHAT.SEND),
  messageCtrl.editMessage
);

router.delete(
  '/messages/:messageId',
  checkPermission(PERMISSIONS.CHAT.DELETE),
  messageCtrl.deleteMessage
);

// In your backend router:
router.patch(
  '/messages/:messageId/read',
  checkPermission(PERMISSIONS.CHAT.SEND),
  messageCtrl.markMessageAsRead
);

module.exports = router;

