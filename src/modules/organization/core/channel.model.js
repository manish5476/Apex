// src/models/channelModel.js
const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  
  name: { type: String, trim: true },

  type: {
    type: String,
    enum: ['public', 'private', 'dm'],
    default: 'public',
  },

  // ✅ ADD THIS FIELD
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // For private / DM channels
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],

  isActive: {
    type: Boolean,
    default: true,
  }
}, { timestamps: true });

module.exports = mongoose.model('Channel', channelSchema);
