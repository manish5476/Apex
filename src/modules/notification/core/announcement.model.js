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
    enum: ['info', 'warning', 'success', 'urgent'], // ✅ Angular expects 'urgent' not 'error'
    default: 'info'
  },
  
  // --- TARGETING LOGIC ---
  targetAudience: {
    type: String,
    enum: ['all', 'role', 'specific'],
    default: 'all',
    required: true
  },
  
  targetRoles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  }],
  
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
  
  isUrgent: {
    type: Boolean,
    default: false
  },
  
  expiresAt: {
    type: Date
  },
  
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ✅ Virtual field for Angular compatibility
announcementSchema.virtual('data').get(function() {
  return {
    _id: this._id,
    title: this.title,
    message: this.message,
    type: this.type,
    senderId: this.senderId,
    organizationId: this.organizationId,
    createdAt: this.createdAt
  };
});

// ✅ Indexes for performance
announcementSchema.index({ organizationId: 1, isActive: 1, createdAt: -1 });
announcementSchema.index({ organizationId: 1, isActive: 1, isUrgent: -1, priority: -1 });
announcementSchema.index({ targetAudience: 1, organizationId: 1 });

// ✅ Pre-save middleware
announcementSchema.pre('save', function(next) {
  // Set isUrgent based on type
  if (this.type === 'urgent') {
    this.isUrgent = true;
    this.priority = 'critical';
  } else if (this.type === 'warning') {
    this.priority = 'high';
  } else if (this.type === 'success') {
    this.priority = 'medium';
  } else {
    this.priority = 'low';
  }
  
  next();
});

// ✅ Instance method to check if user should see announcement
announcementSchema.methods.shouldUserSee = function(userId, userRoleId) {
  if (!this.isActive) return false;
  
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  
  if (this.targetAudience === 'all') return true;
  
  if (this.targetAudience === 'role') {
    return this.targetRoles.some(roleId => roleId.toString() === userRoleId.toString());
  }
  
  if (this.targetAudience === 'specific') {
    return this.targetUsers.some(targetUserId => targetUserId.toString() === userId.toString());
  }
  
  return false;
};

module.exports = mongoose.model('Announcement', announcementSchema);


// const mongoose = require('mongoose');

// const announcementSchema = new mongoose.Schema({
//   organizationId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Organization',
//     required: true,
//     index: true
//   },
//   senderId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   title: {
//     type: String,
//     required: true,
//     trim: true
//   },
//   message: {
//     type: String,
//     required: true
//   },
//   type: {
//     type: String,
//     enum: ['info', 'warning', 'success', 'urgent'],
//     default: 'info'
//   },
//   // --- UPDATED TARGETING LOGIC ---
//   targetAudience: {
//     type: String,
//     // 'all' = everyone in org
//     // 'role' = specific roles (e.g., Admin, HR)
//     // 'specific' = specific list of user IDs
//     enum: ['all', 'role', 'specific'],
//     default: 'all',
//     required: true
//   },
//   // Stores Role IDs if targetAudience === 'role'
//   targetRoles: [{
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Role'
//   }],
//   // Stores User IDs if targetAudience === 'specific'
//   targetUsers: [{
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User'
//   }],
//   readBy: [{
//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User'
//     },
//     readAt: {
//       type: Date,
//       default: Date.now
//     }
//   }],
//   isPinned: {
//     type: Boolean,
//     default: false
//   },
//   priority: {
//   type: String,
//   enum: ['low', 'medium', 'high', 'critical'],
//   default: 'medium'
// },

// // In createAnnouncement
// isUrgent: {
//   type: Boolean,
//   default: false
// },

//   // -------------------------------
//   expiresAt: {
//     type: Date
//   },
//   isActive: {
//     type: Boolean,
//     default: true
//   }
// }, { timestamps: true });

// module.exports = mongoose.model('Announcement', announcementSchema);
