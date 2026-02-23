const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const channelCtrl = require('../../modules/organization/core/channel.controller');
const messageCtrl = require('../../modules/notification/core/message.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. CHANNELS (STATIC & COLLECTION)
// ======================================================

// List channels - 🟢 FIXED: Changed to READ so everyone can see their chat list
router.get(
  '/channels',
  checkPermission(PERMISSIONS.CHAT.READ), 
  channelCtrl.listChannels
);

// Create channel - 🔴 Admin/Manage only
router.post(
  '/channels',
  checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
  channelCtrl.createChannel
);

// ======================================================
// 2. MESSAGES (ROOT & SEARCH)
// ======================================================

// Send a new message
router.post(
  '/messages',
  checkPermission(PERMISSIONS.CHAT.SEND),
  messageCtrl.sendMessage
);

// Upload attachment
router.post(
  '/upload',
  checkPermission(PERMISSIONS.CHAT.SEND),
  upload.single('file'),
  messageCtrl.uploadAttachment
);

// ======================================================
// 3. CHANNEL-SPECIFIC ACTIONS (:channelId)
// ======================================================

// Fetch channel history - 🟢 FIXED: Changed to READ
router.get(
  '/channels/:channelId/messages',
  checkPermission(PERMISSIONS.CHAT.READ), 
  messageCtrl.getMessages
);

// Member Management
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

// 🟢 FIXED: Self-exit should only require READ
router.post(
  '/channels/:channelId/leave',
  checkPermission(PERMISSIONS.CHAT.READ), 
  channelCtrl.leaveChannel
);

// Admin Controls
router.patch('/channels/:channelId/disable', checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL), channelCtrl.disableChannel);
router.patch('/channels/:channelId/enable', checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL), channelCtrl.enableChannel);

// ======================================================
// 4. MESSAGE-SPECIFIC ACTIONS (:messageId)
// ======================================================

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

router.patch(
  '/messages/:messageId/read',
  checkPermission(PERMISSIONS.CHAT.READ), // 🟢 READ is enough to mark as read
  messageCtrl.markMessageAsRead
);

module.exports = router;