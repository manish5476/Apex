

const mongoose = require('mongoose');
const MessageModel = require('./message.model');
const ChannelModel = require('../../organization/core/channel.model'); 
const fileUploadService = require('../../uploads/fileUploadService'); 
const socketUtil = require('../../../socketHandlers/socket'); 

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
// 5. UPLOAD ATTACHMENT
// ==============================================================================
exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const result = await fileUploadService.uploadFile(req.file.buffer, 'chat_attachments', 'auto');

    res.status(200).json({
      name: req.file.originalname,
      url: result.url,
      type: result.format || 'file', 
      publicId: result.public_id,     
      size: result.bytes
    });
  } catch (err) {
    console.error('Upload Attachment Error:', err);
    res.status(500).json({ message: 'File upload failed' });
  }
};

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



// const mongoose = require('mongoose');
// const MessageModel = require('./message.model');
// const ChannelModel = require('../../organization/core/channel.model'); 
// const User = require('../../auth/core/user.model'); 
// const fileUploadService = require('../../uploads/fileUploadService'); 

// // 🛑 IMPORTANT: Update this path to point to your actual socket utility file
// const socketUtil = require('../../../socketHandlers/socket'); 

// // ==============================================================================
// // 1. GET MESSAGES (With Pagination)
// // ==============================================================================
// exports.getMessages = async (req, res) => {
//   try {
//     const { channelId } = req.params;
//     const { before, limit = 50 } = req.query;

//     // Validation
//     if (!mongoose.Types.ObjectId.isValid(channelId)) {
//         return res.status(400).json({ message: 'Invalid Channel ID' });
//     }

//     const filter = { 
//         channelId: new mongoose.Types.ObjectId(channelId) 
//     };
    
//     // Pagination (Load older messages)
//     if (before && before !== 'undefined' && before !== 'null') {
//       filter.createdAt = { $lt: new Date(before) };
//     }

//     const messages = await MessageModel.find(filter)
//       .sort({ createdAt: -1 }) // Newest first
//       .limit(Number(limit))
//       .populate('senderId', 'name email avatar')
//       .lean();

//     // Reverse to show oldest -> newest in UI
//     res.json({ messages: messages.reverse() }); 

//   } catch (err) {
//     console.error('Get Messages Error:', err);
//     res.status(500).json({ message: 'Server error fetching messages' });
//   }
// };

// // ==============================================================================
// // 2. SEND MESSAGE (HTTP)
// // ==============================================================================
// exports.sendMessage = async (req, res) => {
//   try {
//     const { channelId, body, attachments } = req.body;
//     const userId = req.user._id;
//     const orgId = req.user.organizationId;

//     if (!channelId) {
//       return res.status(400).json({ message: 'Channel ID is required' });
//     }
//     if (!body && (!attachments || attachments.length === 0)) {
//       return res.status(400).json({ message: 'Message content cannot be empty' });
//     }

//     // A. Fetch Channel
//     const channel = await ChannelModel.findById(channelId);
//     if (!channel) return res.status(404).json({ message: 'Channel not found' });

//     // B. Security Checks
//     if (String(channel.organizationId) !== String(orgId)) {
//       return res.status(403).json({ message: 'Forbidden: Organization mismatch' });
//     }
//     if (!channel.isActive) {
//       return res.status(400).json({ message: 'Channel is archived or disabled' });
//     }
//     if (channel.type === 'private' || channel.type === 'dm') {
//       const isMember = channel.members.some(m => String(m) === String(userId));
//       if (!isMember) {
//         return res.status(403).json({ message: 'You are not a member of this private channel' });
//       }
//     }

//     // C. Save Message
//     const msg = await MessageModel.create({
//       organizationId: orgId,
//       channelId: channel._id,
//       senderId: userId,
//       body: body ? String(body).trim() : '',
//       attachments: attachments || [],
//       readBy: [userId], 
//       createdAt: new Date()
//     });

//     // D. Populate for UI
//     const populatedMsg = await MessageModel.findById(msg._id)
//       .populate('senderId', 'name email avatar')
//       .lean();

//     // E. Emit Socket Event
//     try { 
//       if (socketUtil && socketUtil.getIo()) {
//         socketUtil.emitToChannel(channelId, 'newMessage', populatedMsg);
//       }
//     } catch (e) {
//       console.warn('⚠️ Message saved, but socket emit failed:', e.message);
//     }

//     return res.status(201).json(populatedMsg);

//   } catch (err) {
//     console.error('❌ Send Message Error:', err);
//     return res.status(500).json({ message: 'Server error sending message' });
//   }
// };

// // ==============================================================================
// // 3. EDIT MESSAGE
// // ==============================================================================
// exports.editMessage = async (req, res) => {
//   try {
//     const { messageId } = req.params;
//     const { body } = req.body;
//     const userId = req.user._id;

//     const msg = await MessageModel.findById(messageId);
//     if (!msg) return res.status(404).json({ message: 'Message not found' });
    
//     // Permission: Only sender
//     if (String(msg.senderId) !== String(userId)) {
//       return res.status(403).json({ message: 'You cannot edit this message' });
//     }

//     msg.body = body;
//     msg.editedAt = Date.now();
//     await msg.save();

//     // Re-populate
//     const populatedMsg = await MessageModel.findById(msg._id)
//         .populate('senderId', 'name email avatar')
//         .lean();

//     // ⚡ FIX: Emit to Channel with updated data
//     try { 
//       socketUtil.emitToChannel(msg.channelId, 'messageEdited', populatedMsg); 
//     } catch(e) { console.error('Socket emit failed', e); }

//     res.json(msg);
//   } catch (err) {
//     res.status(500).json({ message: 'Server error editing message' });
//   }
// };

// // ==============================================================================
// // 4. DELETE MESSAGE
// // ==============================================================================
// exports.deleteMessage = async (req, res) => {
//   try {
//     const { messageId } = req.params;
//     const userId = req.user._id;

//     const msg = await MessageModel.findById(messageId);
//     if (!msg) return res.status(404).json({ message: 'Message not found' });

//     // Permissions: Sender OR Admin/Owner
//     const isOwner = (msg.senderId.toString() === userId.toString());
    
//     // Add extra check for Admins if needed:
//     // const isAdmin = req.user.role === 'admin';
//     // if (!isOwner && !isAdmin) ...

//     if (!isOwner) {
//        return res.status(403).json({ message: 'You cannot delete this message' });
//     }

//     // Soft delete
//     msg.body = '';
//     msg.attachments = []; // Clear attachments on delete
//     msg.deleted = true;
//     await msg.save();

//     // ⚡ FIX: Emit to Channel AND include channelId so frontend knows where to delete
//     try { 
//       socketUtil.emitToChannel(msg.channelId, 'messageDeleted', { 
//           messageId: msg._id,
//           channelId: msg.channelId, // 👈 CRITICAL FOR ANGULAR UI
//           deletedBy: userId
//       }); 
//     } catch(e) { console.error('Socket emit failed', e); }

//     res.json({ success: true });
//   } catch (err) {
//     res.status(500).json({ message: 'Server error deleting message' });
//   }
// };

// // ==============================================================================
// // 5. UPLOAD ATTACHMENT
// // ==============================================================================
// exports.uploadAttachment = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: 'No file uploaded' });
//     }

//     // Stream to Cloudinary
//     const result = await fileUploadService.uploadFile(
//       req.file.buffer, 
//       'chat_attachments', 
//       'auto'
//     );

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

// // ==============================================================================
// // 6. READ RECEIPTS
// // ==============================================================================
// exports.markMessageAsRead = async (req, res) => {
//   const { messageId } = req.params;
//   const userId = req.user._id;

//   // Add to set (prevents duplicates)
//   const message = await MessageModel.findOneAndUpdate(
//     { _id: messageId, organizationId: req.user.organizationId }, 
//     { $addToSet: { readBy: userId } },
//     { new: true }
//   );

//   if (!message) return res.status(404).json({ message: 'Message not found' });
  
//   // Real-time Signal
//   try {
//       socketUtil.emitToChannel(message.channelId, 'messageRead', { 
//           messageId, 
//           userId,
//           readAt: new Date()
//       });
//   } catch(e) { console.error('Socket emit failed', e); }

//   res.json({ success: true });
// };