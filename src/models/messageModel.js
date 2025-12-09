// src/models/messageModel.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },

  channelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
    index: true,
  },

  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  body: {
    type: String,
    trim: true,
  },

  attachments: [{
    url: String,
    type: String,
  }],

  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }]
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
