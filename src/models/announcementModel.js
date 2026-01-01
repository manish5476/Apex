const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'success', 'urgent'],
    default: 'info'
  },
  // --- UPDATED TARGETING LOGIC ---
  targetAudience: {
    type: String,
    // 'all' = everyone in org
    // 'role' = specific roles (e.g., Admin, HR)
    // 'specific' = specific list of user IDs
    enum: ['all', 'role', 'specific'],
    default: 'all',
    required: true
  },
  // Stores Role IDs if targetAudience === 'role'
  targetRoles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  }],
  // Stores User IDs if targetAudience === 'specific'
  targetUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  isPinned: {
    type: Boolean,
    default: false
  },
  priority: {
  type: String,
  enum: ['low', 'medium', 'high', 'critical'],
  default: 'medium'
},

// In createAnnouncement
isUrgent: {
  type: Boolean,
  default: false
},

  // -------------------------------
  expiresAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);
