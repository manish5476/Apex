const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const channelCtrl = require('../../controllers/channelController');
const messageCtrl = require('../../controllers/messageController');
const authController = require('../../controllers/authController');
const { checkPermission } = require('../../middleware/permissionMiddleware');
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

module.exports = router;


// const express = require('express');
// const router = express.Router();
// const multer = require('multer');

// // Configure Multer (Memory Storage so we can pass buffer to Cloudinary)
// const upload = multer({ storage: multer.memoryStorage() });

// const channelCtrl = require('../../controllers/channelController');
// const messageCtrl = require('../../controllers/messageController');
// const authController = require('../../controllers/authController');

// router.use(authController.protect);

// // --- File Upload Route ---
// // ✅ Attach this new route
// router.post('/upload', upload.single('file'), messageCtrl.uploadAttachment);

// router.post('/channels', channelCtrl.createChannel);
// router.get('/channels', channelCtrl.listChannels);
// router.post('/channels/:channelId/members', channelCtrl.addMember);
// router.delete('/channels/:channelId/members/:userId', channelCtrl.removeMember);
// router.patch('/channels/:channelId/disable', channelCtrl.disableChannel);
// router.patch('/channels/:channelId/enable', channelCtrl.enableChannel);

// // Message operations
// router.get('/channels/:channelId/messages', messageCtrl.getMessages);
// router.patch('/messages/:messageId', messageCtrl.editMessage);
// router.delete('/messages/:messageId', messageCtrl.deleteMessage);

// module.exports = router;

