// -----------------------------------------------------------------------------
// FILE: src/routes/chatRoutes.js
// Minimal express routes wiring for the controllers above
const express = require('express');
const router = express.Router();
const channelCtrl = require('../../controllers/channelController');
const messageCtrl = require('../../controllers/messageController');
const authController = require('../../controllers/authController');
router.use(authController.protect);

// Channel operations
router.post('/channels', channelCtrl.createChannel);
router.get('/channels', channelCtrl.listChannels);
router.post('/channels/:channelId/members', channelCtrl.addMember);
router.delete('/channels/:channelId/members/:userId', channelCtrl.removeMember);
router.patch('/channels/:channelId/disable', channelCtrl.disableChannel);
router.patch('/channels/:channelId/enable', channelCtrl.enableChannel);

// Message operations
router.get('/channels/:channelId/messages', messageCtrl.getMessages);
router.patch('/messages/:messageId', messageCtrl.editMessage);
router.delete('/messages/:messageId', messageCtrl.deleteMessage);

module.exports = router;

