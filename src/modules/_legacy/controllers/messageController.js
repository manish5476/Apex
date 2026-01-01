// src/controllers/messageController.js
const MessageModel = require('../models/messageModel');
const User = require('../models/userModel'); // Needed for role check in delete
const fileUploadService = require('../services/uploads/fileUploadService'); // ✅ Import your service
exports.getMessages = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { before, limit = 50 } = req.query;

    const filter = { channelId };
    if (before) {
      filter.createdAt = { $lt: new Date(before) };
    }

    const messages = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('senderId', 'name email') // ✅ ADDS USER NAMES
      .lean();

    res.json({ messages });
  } catch (err) {
    console.error('Get Messages Error:', err);
    res.status(500).json({ message: 'Server error fetching messages' });
  }
};

exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { body } = req.body;
    const userId = req.user._id;

    const msg = await MessageModel.findById(messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    
    // Ensure only sender can edit
    if (String(msg.senderId) !== String(userId)) {
      return res.status(403).json({ message: 'You cannot edit this message' });
    }

    msg.body = body;
    msg.editedAt = Date.now();
    await msg.save();

    // Notify via socket (Optional: wrap in try-catch so it doesn't fail request)
    try { 
      const socketUtil = require('../utils/socket'); 
      socketUtil.emitToOrg(msg.organizationId, 'messageEdited', msg); 
    } catch(e) { console.error('Socket emit failed', e); }

    res.json(msg);
  } catch (err) {
    res.status(500).json({ message: 'Server error editing message' });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const msg = await MessageModel.findById(messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    // Check permissions: Sender OR Admin/Owner
    const actor = await User.findById(userId).select('role');
    // Note: Adjust logic depending on if 'role' is a string or an ObjectId in your system
    // Assuming role is populated or checked against string values:
    // If using Role Model (ObjectId), you'd need to populate or fetch Role details separately.
    // For simplicity here, assuming simple role check or Owner check:
    
    const isOwner = (msg.senderId.toString() === userId.toString());
    
    // If you have specific roles logic:
    // const isSuperAdmin = actor.role === 'superadmin' || ...
    
    if (!isOwner) {
       // Only allow deletion if sender. Add admin logic here if needed.
       return res.status(403).json({ message: 'You cannot delete this message' });
    }

    // Soft delete
    msg.body = '';
    msg.deleted = true;
    await msg.save();

    try { 
      const socketUtil = require('../utils/socket'); 
      socketUtil.emitToOrg(msg.organizationId, 'messageDeleted', { messageId }); 
    } catch(e) { console.error('Socket emit failed', e); }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error deleting message' });
  }
};

exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // 1. Upload to Cloudinary using your existing service
    // We use a specific folder 'chat_attachments' to keep things organized
    const result = await fileUploadService.uploadFile(
      req.file.buffer, 
      'chat_attachments', 
      'auto'
    );

    // 2. Return the data needed for the frontend 'Attachment' interface
    res.status(200).json({
      name: req.file.originalname,
      url: result.url,
      type: result.format || 'file', // or req.file.mimetype
      publicId: result.public_id,     // Useful if you want to delete it later
      size: result.bytes
    });

  } catch (err) {
    console.error('Upload Attachment Error:', err);
    res.status(500).json({ message: 'File upload failed' });
  }
};