const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  body: { type: String, trim: true },

  // 👇 FIX: Handle the 'type' field correctly
  attachments: [{
    name: String,
    url: String,
    type: { type: String }, // ✅ CORRECT: Wraps the reserved keyword
    size: Number,
    publicId: String
  }],

  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deleted: { type: Boolean, default: false },
  editedAt: { type: Date }
  
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
