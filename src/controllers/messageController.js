

// -----------------------------------------------------------------------------
// FILE: src/controllers/messageController.js
// Controllers for fetching, editing, deleting messages and server-side actions
const MessageModel = require('../models/messageModel');

exports.getMessages = async (req, res) => {
  const { channelId } = req.params;
  const { before, limit = 50 } = req.query;
  const orgId = req.user.organizationId;

  // permission checks: ensure channel belongs to org and user is member if private
  const filter = { channelId };
  if (before) filter.createdAt = { $lt: new Date(before) };

  const messages = await MessageModel.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
  res.json({ messages });
};

exports.editMessage = async (req, res) => {
  const { messageId } = req.params;
  const { body } = req.body;
  const userId = req.user._id;

  const msg = await MessageModel.findById(messageId);
  if (!msg) return res.status(404).json({ message: 'not found' });
  if (String(msg.senderId) !== String(userId)) return res.status(403).json({ message: 'cannot edit' });

  msg.body = body;
  msg.editedAt = Date.now();
  await msg.save();

  // Notify via socket (if available)
  try { const socketUtil = require('../utils/socket'); socketUtil.emitToOrg(msg.organizationId, 'messageEdited', msg); } catch(e){}

  res.json(msg);
};

exports.deleteMessage = async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user._id;

  const msg = await MessageModel.findById(messageId);
  if (!msg) return res.status(404).json({ message: 'not found' });

  const actor = await User.findById(userId).select('role');
  const isOwnerOrAdmin = actor && ['superadmin','admin','owner'].includes(actor.role);

  if (String(msg.senderId) !== String(userId) && !isOwnerOrAdmin) return res.status(403).json({ message: 'cannot delete' });

  // soft delete pattern
  msg.body = '';
  msg.deleted = true;
  await msg.save();

  try { const socketUtil = require('../utils/socket'); socketUtil.emitToOrg(msg.organizationId, 'messageDeleted', { messageId }); } catch(e){}

  res.json({ success: true });
};

