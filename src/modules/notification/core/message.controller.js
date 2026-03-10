

const mongoose = require('mongoose');
const MessageModel = require('./message.model');
const ChannelModel = require('../../organization/core/channel.model'); 
const fileUploadService = require('../../uploads/fileUploadService'); 
const socketUtil = require('../../../socketHandlers/socket'); 
const imageUploadService = require('../../uploads/imageUploadService'); // Adjust path as needed
// ==============================================================================
// 1. GET MESSAGES (With Pagination & Security)
// ==============================================================================
exports.getMessages = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { before, limit = 50 } = req.query;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
        return res.status(400).json({ message: 'Invalid Channel ID' });
    }

    // 🛑 SECURITY: Ensure channel belongs to org AND user has access
    const channel = await ChannelModel.findOne({ 
      _id: channelId, 
      organizationId: req.user.organizationId 
    }).lean();

    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    
    if (channel.type !== 'public') {
      const isMember = channel.members.some(m => String(m) === String(userId));
      if (!isMember) return res.status(403).json({ message: 'You are not a member of this channel' });
    }

    // 🛑 PERFORMANCE: Cap the maximum limit to prevent RAM crashes
    const safeLimit = Math.min(Number(limit) || 50, 100);

    const filter = { channelId: new mongoose.Types.ObjectId(channelId) };
    if (before && before !== 'undefined' && before !== 'null') {
      filter.createdAt = { $lt: new Date(before) };
    }

    const messages = await MessageModel.find(filter)
      .sort({ createdAt: -1 }) 
      .limit(safeLimit)
      .populate('senderId', 'name email avatar')
      .lean();

    res.json({ messages: messages.reverse() }); 
  } catch (err) {
    console.error('Get Messages Error:', err);
    res.status(500).json({ message: 'Server error fetching messages' });
  }
};

// ==============================================================================
// 2. SEND MESSAGE
// ==============================================================================
exports.sendMessage = async (req, res) => {
  try {
    const { channelId, body, attachments } = req.body;
    const userId = req.user._id;
    const orgId = req.user.organizationId;

    if (!channelId) return res.status(400).json({ message: 'Channel ID is required' });
    if (!body && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ message: 'Message content cannot be empty' });
    }

    const channel = await ChannelModel.findById(channelId).lean();
    if (!channel || String(channel.organizationId) !== String(orgId)) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    if (!channel.isActive) return res.status(400).json({ message: 'Channel is disabled' });

    if (channel.type !== 'public') {
      if (!channel.members.some(m => String(m) === String(userId))) {
        return res.status(403).json({ message: 'You are not a member of this channel' });
      }
    }

    const msg = await MessageModel.create({
      organizationId: orgId,
      channelId: channel._id,
      senderId: userId,
      body: body ? String(body).trim() : '',
      attachments: attachments || [],
      readBy: [userId], 
      createdAt: new Date()
    });

    const populatedMsg = await MessageModel.findById(msg._id)
      .populate('senderId', 'name email avatar')
      .lean();

    // ⚡ REAL-TIME: Emit to sockets
    socketUtil.emitToChannel(channelId, 'newMessage', populatedMsg);
    socketUtil.emitToOrg(orgId, 'channelActivity', {
      channelId,
      lastMessage: { _id: msg._id, body: msg.body, createdAt: msg.createdAt, senderId: msg.senderId }
    });

    return res.status(201).json(populatedMsg);
  } catch (err) {
    console.error('Send Message Error:', err);
    return res.status(500).json({ message: 'Server error sending message' });
  }
};

// ==============================================================================
// 3. EDIT MESSAGE
// ==============================================================================
exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { body } = req.body;
    const userId = req.user._id;

    const msg = await MessageModel.findById(messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    
    if (String(msg.senderId) !== String(userId)) {
      return res.status(403).json({ message: 'You cannot edit this message' });
    }

    msg.body = body;
    msg.editedAt = Date.now();
    await msg.save();

    const populatedMsg = await MessageModel.findById(msg._id)
        .populate('senderId', 'name email avatar')
        .lean();

    socketUtil.emitToChannel(msg.channelId, 'messageEdited', populatedMsg); 

    res.json(msg);
  } catch (err) {
    res.status(500).json({ message: 'Server error editing message' });
  }
};

// ==============================================================================
// 4. DELETE MESSAGE
// ==============================================================================
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const msg = await MessageModel.findById(messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    const isOwner = String(msg.senderId) === String(userId);
    const isAdmin = ['admin', 'superadmin', 'owner'].includes(userRole);

    if (!isOwner && !isAdmin) {
       return res.status(403).json({ message: 'You cannot delete this message' });
    }

    msg.body = '';
    msg.attachments = []; 
    msg.deleted = true;
    await msg.save();

    socketUtil.emitToChannel(msg.channelId, 'messageDeleted', { 
        messageId: msg._id,
        channelId: msg.channelId,
        deletedBy: userId,
        timestamp: new Date().toISOString()
    }); 

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error deleting message' });
  }
};
// ==============================================================================
// 5. UPLOAD ATTACHMENT (Integrated with Master Asset System)
// ==============================================================================
exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // 1. UPLOAD & RECORD: Create the physical file and the Database Asset record.
    // Categorizing as 'chat' keeps your Media Gallery perfectly organized.
    const asset = await imageUploadService.uploadAndRecord(req.file, req.user, 'chat');

    // 2. RETURN FORMATTED DATA: Send back exactly what the frontend needs 
    // to attach to the message, plus the new Master Asset ID.
    res.status(200).json({
      name: asset.fileName,
      url: asset.url,
      type: asset.mimeType || 'file', 
      publicId: asset.publicId,     
      size: asset.size,
      assetId: asset._id // The critical link to the Master Asset system
    });

  } catch (err) {
    console.error('❌ Upload Attachment Error:', err);
    
    // Handle specific AppError instances gracefully
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    
    res.status(500).json({ message: 'Server error during file upload' });
  }
};


// // ==============================================================================
// // 5. UPLOAD ATTACHMENT
// // ==============================================================================
// exports.uploadAttachment = async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

//     const result = await fileUploadService.uploadFile(req.file.buffer, 'chat_attachments', 'auto');

//     res.status(200).json({
//       name: req.file.originalname,
//       url: result.url,
//       type: result.format || 'file', 
//       publicId: result.public_id,     
//       size: result.bytes
//     });
//   } catch (err) {
//     console.error('Upload Attachment Error:', err);
//     res.status(500).json({ message: 'File upload failed' });
//   }
// };

// ==============================================================================
// 6. READ RECEIPTS
// ==============================================================================
exports.markMessageAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await MessageModel.findOneAndUpdate(
      { _id: messageId, organizationId: req.user.organizationId }, 
      { $addToSet: { readBy: userId } },
      { new: true }
    );

    if (!message) return res.status(404).json({ message: 'Message not found' });
    
    socketUtil.emitToChannel(message.channelId, 'messageRead', { 
        messageId, 
        userId, 
        readAt: new Date()
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error marking read' });
  }
};
