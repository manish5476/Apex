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

// 1. Uploads
router.post(
  '/upload',
  checkPermission(PERMISSIONS.CHAT.SEND),
  upload.single('file'),
  messageCtrl.uploadAttachment
);

// 2. Channel Management
router.post(
  '/channels',
  checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
  channelCtrl.createChannel
);

// ⚠️ FIXED: Listing channels usually shouldn't require 'MANAGE' permissions.
// If regular users can chat, change this to PERMISSIONS.CHAT.READ or similar.
// If you leave it as MANAGE_CHANNEL, only Admins can see the chat list.
router.get(
  '/channels',
  // checkPermission(PERMISSIONS.CHAT.READ), // Recommended change
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

// Leave Channel (Self)
router.post(
  '/channels/:channelId/leave',
  // checkPermission(PERMISSIONS.CHAT.READ), // Anyone who can read can leave
  channelCtrl.leaveChannel
);

// Add Member
router.post(
  '/channels/:channelId/members',
  checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL), // Admin only
  channelCtrl.addMember
);

// Remove Member (Admin force remove)
router.delete(
  '/channels/:channelId/members/:userId',
  checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL), // Admin only
  channelCtrl.removeMember
);

// 3. Messages
// ⚠️ FIXED: Fetching messages shouldn't require SEND permissions (read-only users?)
// But keeping it as SEND is okay if you don't have a READ permission.
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

// 🔥 CRITICAL FIX: Changed PATCH to POST for sending messages
router.post(
  '/messages',
  checkPermission(PERMISSIONS.CHAT.SEND),
  messageCtrl.sendMessage
);

router.delete(
  '/messages/:messageId',
  checkPermission(PERMISSIONS.CHAT.DELETE),
  messageCtrl.deleteMessage
);

router.patch(
  '/messages/:messageId/read',
  checkPermission(PERMISSIONS.CHAT.SEND),
  messageCtrl.markMessageAsRead
);

module.exports = router;

// const express = require('express');
// const router = express.Router();
// const multer = require('multer');
// const upload = multer({ storage: multer.memoryStorage() });

// const channelCtrl = require('../../modules/organization/core/channel.controller');
// const messageCtrl = require('../../modules/notification/core/message.controller');
// const authController = require('../../modules/auth/core/auth.controller');
// const { checkPermission } = require('../../core/middleware/permission.middleware');
// const { PERMISSIONS } = require('../../config/permissions');

// router.use(authController.protect);

// router.post(
//   '/upload',
//   checkPermission(PERMISSIONS.CHAT.SEND),
//   upload.single('file'),
//   messageCtrl.uploadAttachment
// );

// router.post(
//   '/channels',
//   checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
//   channelCtrl.createChannel
// );

// router.get(
//   '/channels',
//   checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
//   channelCtrl.listChannels
// );

// router.post(
//   '/channels/:channelId/members',
//   checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
//   channelCtrl.addMember
// );

// router.delete(
//   '/channels/:channelId/members/:userId',
//   checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
//   channelCtrl.removeMember
// );

// router.patch(
//   '/channels/:channelId/disable',
//   checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
//   channelCtrl.disableChannel
// );

// router.patch(
//   '/channels/:channelId/enable',
//   checkPermission(PERMISSIONS.CHAT.MANAGE_CHANNEL),
//   channelCtrl.enableChannel
// );

// router.get(
//   '/channels/:channelId/messages',
//   checkPermission(PERMISSIONS.CHAT.SEND),
//   messageCtrl.getMessages
// );

// router.patch(
//   '/messages/:messageId',
//   checkPermission(PERMISSIONS.CHAT.SEND),
//   messageCtrl.editMessage
// );


// router.delete(
//   '/messages/:messageId',
//   checkPermission(PERMISSIONS.CHAT.DELETE),
//   messageCtrl.deleteMessage
// );

// // In your backend router:
// router.patch(
//   '/messages/:messageId/read',
//   checkPermission(PERMISSIONS.CHAT.SEND),
//   messageCtrl.markMessageAsRead
// );
// router.post(
//   '/messages',
//   checkPermission(PERMISSIONS.CHAT.SEND),
//   messageCtrl.sendMessage
// );
// module.exports = router;

