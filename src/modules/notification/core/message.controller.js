const mongoose = require('mongoose');
const MessageModel = require('./message.model');
const ChannelModel = require('../../organization/core/channel.model'); 
const User = require('../../auth/core/user.model'); 
const fileUploadService = require('../../uploads/fileUploadService'); 

// 🛑 IMPORTANT: Update this path to point to your actual socket utility file
const socketUtil = require('../../../socketHandlers/socket'); 

// ==============================================================================
// 1. GET MESSAGES (With Pagination)
// ==============================================================================
exports.getMessages = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { before, limit = 50 } = req.query;

    // Validation
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
        return res.status(400).json({ message: 'Invalid Channel ID' });
    }

    const filter = { 
        channelId: new mongoose.Types.ObjectId(channelId) 
    };
    
    // Pagination (Load older messages)
    if (before && before !== 'undefined' && before !== 'null') {
      filter.createdAt = { $lt: new Date(before) };
    }

    const messages = await MessageModel.find(filter)
      .sort({ createdAt: -1 }) // Newest first
      .limit(Number(limit))
      .populate('senderId', 'name email avatar')
      .lean();

    // Reverse to show oldest -> newest in UI
    res.json({ messages: messages.reverse() }); 

  } catch (err) {
    console.error('Get Messages Error:', err);
    res.status(500).json({ message: 'Server error fetching messages' });
  }
};

// ==============================================================================
// 2. SEND MESSAGE (HTTP)
// ==============================================================================
exports.sendMessage = async (req, res) => {
  try {
    const { channelId, body, attachments } = req.body;
    const userId = req.user._id;
    const orgId = req.user.organizationId;

    if (!channelId) {
      return res.status(400).json({ message: 'Channel ID is required' });
    }
    if (!body && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ message: 'Message content cannot be empty' });
    }

    // A. Fetch Channel
    const channel = await ChannelModel.findById(channelId);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });

    // B. Security Checks
    if (String(channel.organizationId) !== String(orgId)) {
      return res.status(403).json({ message: 'Forbidden: Organization mismatch' });
    }
    if (!channel.isActive) {
      return res.status(400).json({ message: 'Channel is archived or disabled' });
    }
    if (channel.type === 'private' || channel.type === 'dm') {
      const isMember = channel.members.some(m => String(m) === String(userId));
      if (!isMember) {
        return res.status(403).json({ message: 'You are not a member of this private channel' });
      }
    }

    // C. Save Message
    const msg = await MessageModel.create({
      organizationId: orgId,
      channelId: channel._id,
      senderId: userId,
      body: body ? String(body).trim() : '',
      attachments: attachments || [],
      readBy: [userId], 
      createdAt: new Date()
    });

    // D. Populate for UI
    const populatedMsg = await MessageModel.findById(msg._id)
      .populate('senderId', 'name email avatar')
      .lean();

    // E. Emit Socket Event
    try { 
      if (socketUtil && socketUtil.getIo()) {
        socketUtil.emitToChannel(channelId, 'newMessage', populatedMsg);
      }
    } catch (e) {
      console.warn('⚠️ Message saved, but socket emit failed:', e.message);
    }

    return res.status(201).json(populatedMsg);

  } catch (err) {
    console.error('❌ Send Message Error:', err);
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
    
    // Permission: Only sender
    if (String(msg.senderId) !== String(userId)) {
      return res.status(403).json({ message: 'You cannot edit this message' });
    }

    msg.body = body;
    msg.editedAt = Date.now();
    await msg.save();

    // Re-populate
    const populatedMsg = await MessageModel.findById(msg._id)
        .populate('senderId', 'name email avatar')
        .lean();

    // ⚡ FIX: Emit to Channel with updated data
    try { 
      socketUtil.emitToChannel(msg.channelId, 'messageEdited', populatedMsg); 
    } catch(e) { console.error('Socket emit failed', e); }

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

    const msg = await MessageModel.findById(messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    // Permissions: Sender OR Admin/Owner
    const isOwner = (msg.senderId.toString() === userId.toString());
    
    // Add extra check for Admins if needed:
    // const isAdmin = req.user.role === 'admin';
    // if (!isOwner && !isAdmin) ...

    if (!isOwner) {
       return res.status(403).json({ message: 'You cannot delete this message' });
    }

    // Soft delete
    msg.body = '';
    msg.attachments = []; // Clear attachments on delete
    msg.deleted = true;
    await msg.save();

    // ⚡ FIX: Emit to Channel AND include channelId so frontend knows where to delete
    try { 
      socketUtil.emitToChannel(msg.channelId, 'messageDeleted', { 
          messageId: msg._id,
          channelId: msg.channelId, // 👈 CRITICAL FOR ANGULAR UI
          deletedBy: userId
      }); 
    } catch(e) { console.error('Socket emit failed', e); }

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
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Stream to Cloudinary
    const result = await fileUploadService.uploadFile(
      req.file.buffer, 
      'chat_attachments', 
      'auto'
    );

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
  const { messageId } = req.params;
  const userId = req.user._id;

  // Add to set (prevents duplicates)
  const message = await MessageModel.findOneAndUpdate(
    { _id: messageId, organizationId: req.user.organizationId }, 
    { $addToSet: { readBy: userId } },
    { new: true }
  );

  if (!message) return res.status(404).json({ message: 'Message not found' });
  
  // Real-time Signal
  try {
      socketUtil.emitToChannel(message.channelId, 'messageRead', { 
          messageId, 
          userId,
          readAt: new Date()
      });
  } catch(e) { console.error('Socket emit failed', e); }

  res.json({ success: true });
};
// // src/controllers/messageController.js
// const MessageModel = require('./message.model');
// // src/controllers/messageController.js
// const mongoose = require('mongoose'); // 👈 ADD THIS LINE
// const ChannelModel = require('../../organization/core/channel.model'); // Update this path
// const User = require('../../auth/core/user.model'); // Needed for role check in delete
// const fileUploadService = require('../../_legacy/services/uploads/fileUploadService'); // ✅ Import your service
// // exports.getMessages = async (req, res) => {
// //   try {
// //     const { channelId } = req.params;
// //     const { before, limit = 50 } = req.query;

// //     const filter = { channelId };
// //     if (before) {
// //       filter.createdAt = { $lt: new Date(before) };
// //     }
// // const messages = await MessageModel.find(filter)
// //   .sort({ createdAt: -1 })
// //   .limit(Number(limit))
// //   .populate('senderId', 'name email avatar') // Added avatar for UI
// //   .lean();

// //     res.json({ messages });
// //   } catch (err) {
// //     console.error('Get Messages Error:', err);
// //     res.status(500).json({ message: 'Server error fetching messages' });
// //   }
// // };

// exports.getMessages = async (req, res) => {
//   try {
//     const { channelId } = req.params;
//     const { before, limit = 50 } = req.query;

//     // 1. Basic Validation
//     if (!mongoose.Types.ObjectId.isValid(channelId)) {
//         return res.status(400).json({ message: 'Invalid Channel ID' });
//     }

//     // 2. Build Filter
//     const filter = { 
//         channelId: new mongoose.Types.ObjectId(channelId) // ✅ Force ObjectId
//     };
    
//     // 3. Date Filter (Safeguard against "undefined" string)
//     if (before && before !== 'undefined' && before !== 'null') {
//       filter.createdAt = { $lt: new Date(before) };
//     }

//     const messages = await MessageModel.find(filter)
//       .sort({ createdAt: -1 })
//       .limit(Number(limit))
//       .populate('senderId', 'name email avatar')
//       .lean();

//     // 4. Return correct structure
//     // (Your client might expect { messages: [] } or just [])
//     res.json({ messages: messages.reverse() }); // Reverse so they appear top-to-bottom in UI

//   } catch (err) {
//     console.error('Get Messages Error:', err);
//     res.status(500).json({ message: 'Server error fetching messages' });
//   }
// };

// exports.editMessage = async (req, res) => {
//   try {
//     const { messageId } = req.params;
//     const { body } = req.body;
//     const userId = req.user._id;

//     const msg = await MessageModel.findById(messageId);
//     if (!msg) return res.status(404).json({ message: 'Message not found' });
    
//     // Ensure only sender can edit
//     if (String(msg.senderId) !== String(userId)) {
//       return res.status(403).json({ message: 'You cannot edit this message' });
//     }

//     msg.body = body;
//     msg.editedAt = Date.now();
//     await msg.save();

//     // Notify via socket (Optional: wrap in try-catch so it doesn't fail request)
//     try { 
//       const socketUtil = require('../../../socketHandlers/socket'); 
//       socketUtil.emitToOrg(msg.organizationId, 'messageEdited', msg); 
//     } catch(e) { console.error('Socket emit failed', e); }

//     res.json(msg);
//   } catch (err) {
//     res.status(500).json({ message: 'Server error editing message' });
//   }
// };

// exports.deleteMessage = async (req, res) => {
//   try {
//     const { messageId } = req.params;
//     const userId = req.user._id;

//     const msg = await MessageModel.findById(messageId);
//     if (!msg) return res.status(404).json({ message: 'Message not found' });

//     // Check permissions: Sender OR Admin/Owner
//     const actor = await User.findById(userId).select('role');
//     // Note: Adjust logic depending on if 'role' is a string or an ObjectId in your system
//     // Assuming role is populated or checked against string values:
//     // If using Role Model (ObjectId), you'd need to populate or fetch Role details separately.
//     // For simplicity here, assuming simple role check or Owner check:
    
//     const isOwner = (msg.senderId.toString() === userId.toString());
    
//     // If you have specific roles logic:
//     // const isSuperAdmin = actor.role === 'superadmin' || ...
    
//     if (!isOwner) {
//        // Only allow deletion if sender. Add admin logic here if needed.
//        return res.status(403).json({ message: 'You cannot delete this message' });
//     }

//     // Soft delete
//     msg.body = '';
//     msg.deleted = true;
//     await msg.save();

//     try { 
//       const socketUtil = require('../../../socketHandlers/socket'); 
//       socketUtil.emitToOrg(msg.organizationId, 'messageDeleted', { messageId }); 
//     } catch(e) { console.error('Socket emit failed', e); }

//     res.json({ success: true });
//   } catch (err) {
//     res.status(500).json({ message: 'Server error deleting message' });
//   }
// };

// exports.uploadAttachment = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: 'No file uploaded' });
//     }

//     // 1. Upload to Cloudinary using your existing service
//     // We use a specific folder 'chat_attachments' to keep things organized
//     const result = await fileUploadService.uploadFile(
//       req.file.buffer, 
//       'chat_attachments', 
//       'auto'
//     );

//     // 2. Return the data needed for the frontend 'Attachment' interface
//     res.status(200).json({
//       name: req.file.originalname,
//       url: result.url,
//       type: result.format || 'file', // or req.file.mimetype
//       publicId: result.public_id,     // Useful if you want to delete it later
//       size: result.bytes
//     });

//   } catch (err) {
//     console.error('Upload Attachment Error:', err);
//     res.status(500).json({ message: 'File upload failed' });
//   }
// };

// // Optimized markMessageAsRead
// exports.markMessageAsRead = async (req, res) => {
//   const { messageId } = req.params;
//   const userId = req.user._id;

//   // Atomic update: only adds if NOT already present, prevents document version conflicts
//   const message = await MessageModel.findOneAndUpdate(
//     { _id: messageId, organizationId: req.user.organizationId }, // Strict tenant isolation
//     { $addToSet: { readBy: userId } },
//     { new: true }
//   );

//   if (!message) return res.status(404).json({ message: 'Message not found' });
  
//   // Real-time Signal
//   const socketUtil = require('../../../socketHandlers/socket');
//   socketUtil.emitToChannel(message.channelId, 'messageRead', { messageId, userId });

//   res.json({ success: true });
// };







// // You might need this if you put the socket util in a specific folder:
// // const socketUtil = require('../utils/socket'); 

// exports.sendMessage = async (req, res) => {
//   try {
//     const { channelId, body, attachments } = req.body;
//     const userId = req.user._id;
//     const orgId = req.user.organizationId;

//     // 1. Validate Input
//     if (!channelId) {
//       return res.status(400).json({ message: 'Channel ID is required' });
//     }
//     if (!body && (!attachments || attachments.length === 0)) {
//       return res.status(400).json({ message: 'Message content cannot be empty' });
//     }

//     // 2. Fetch the Channel & VERIFY ACCESS
//     const channel = await ChannelModel.findById(channelId);

//     if (!channel) {
//       return res.status(404).json({ message: 'Channel not found' });
//     }

//     // Security Check A: Must belong to same organization
//     if (String(channel.organizationId) !== String(orgId)) {
//       return res.status(403).json({ message: 'Forbidden: Organization mismatch' });
//     }

//     // Security Check B: Is channel active?
//     if (!channel.isActive) {
//       return res.status(400).json({ message: 'Channel is archived or disabled' });
//     }

//     // Security Check C: If Private/DM, user MUST be a member
//     if (channel.type === 'private' || channel.type === 'dm') {
//       const isMember = channel.members.some(m => String(m) === String(userId));
      
//       // Allow superadmin/owners to post? Usually NO for DMs, maybe YES for private channels.
//       // Strict privacy rule: Only members can post.
//       if (!isMember) {
//         return res.status(403).json({ message: 'You are not a member of this private channel' });
//       }
//     }

//     // 3. Create the Message
//     const msg = await MessageModel.create({
//       organizationId: orgId,
//       channelId: channel._id,
//       senderId: userId,
//       body: body ? String(body).trim() : '',
//       attachments: attachments || [],
//       readBy: [userId], // Sender has read it
//       createdAt: new Date()
//     });

//     // 4. Populate Sender Details (for the UI)
//     const populatedMsg = await MessageModel.findById(msg._id)
//       .populate('senderId', 'name email avatar')
//       .lean();

//     // 5. Emit Socket Event (Real-time update)
//     try {
//       const socketUtil = require('../../../socketHandlers/socket'); 
//       if (socketUtil && socketUtil.getIo()) {
//         socketUtil.emitToChannel(channelId, 'newMessage', populatedMsg);
//       }
//     } catch (e) {
//       console.warn('⚠️ Message saved, but socket emit failed:', e.message);
//       // We do NOT fail the request here. The message is safe in DB.
//     }

//     // 6. Return Success
//     return res.status(201).json(populatedMsg);

//   } catch (err) {
//     console.error('❌ Send Message Error:', err);
//     return res.status(500).json({ message: 'Server error sending message' });
//   }
// };

// // // Add to your message controller
// // exports.markMessageAsRead = async (req, res) => {
// //   try {
// //     const { messageId } = req.params;
// //     const userId = req.user._id;
    
// //     const message = await MessageModel.findById(messageId);
// //     if (!message) return res.status(404).json({ message: 'Message not found' });
    
// //     // Add user to readBy array if not already there
// //     if (!message.readBy.includes(userId)) {
// //       message.readBy.push(userId);
// //       await message.save();
// //     }
    
// //     // Emit read receipt
// //     try {
// //       const socketUtil = require('../../../socketHandlers/socket');
// //       socketUtil.emitToChannel(message.channelId, 'messageRead', {
// //         messageId,
// //         userId,
// //         readAt: new Date()
// //       });
// //     } catch(e) { console.error('Socket emit failed', e); }
    
// //     res.json({ success: true });
// //   } catch (err) {
// //     res.status(500).json({ message: 'Server error marking message as read' });
// //   }
// // };
