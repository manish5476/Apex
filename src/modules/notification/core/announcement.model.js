const mongoose = require('mongoose');

// Separate collection to track reads — avoids the 16MB BSON limit
// when a 500-person org all read the same announcement.
// Use: AnnouncementRead.exists({ announcementId, userId }) to check
const announcementReadSchema = new mongoose.Schema({
  announcementId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Announcement',
    required: true,
    index:    true,
  },
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },
  readAt: { type: Date, default: Date.now },
}, { timestamps: false });

announcementReadSchema.index({ announcementId: 1, userId: 1 }, { unique: true });

const AnnouncementRead = mongoose.model('AnnouncementRead', announcementReadSchema);

// ── Main Schema ───────────────────────────────────────────────────────────────
const announcementSchema = new mongoose.Schema(
  {
    organizationId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Organization',
      required: true,
      index:    true,
    },
    senderId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },

    title:   { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    type: {
      type:    String,
      enum:    ['info', 'warning', 'success', 'urgent'],
      default: 'info',
    },

    // ── Targeting ──────────────────────────────────────────────────────────
    targetAudience: {
      type:     String,
      enum:     ['all', 'role', 'specific'],
      default:  'all',
      required: true,
    },
    targetRoles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // ── Metadata ───────────────────────────────────────────────────────────
    isPinned:  { type: Boolean, default: false },
    isUrgent:  { type: Boolean, default: false },
    isActive:  { type: Boolean, default: true, index: true },
    expiresAt: { type: Date },

    priority: {
      type:    String,
      enum:    ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
announcementSchema.index({ organizationId: 1, isActive: 1, createdAt: -1 });
announcementSchema.index({ organizationId: 1, isActive: 1, isPinned: -1, priority: -1 });
announcementSchema.index({ organizationId: 1, targetAudience: 1, isActive: 1 });

// TTL index — auto-expire announcements after expiresAt
// (MongoDB removes the doc when expiresAt passes)
announcementSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

// ── Pre-save: derive isUrgent + priority from type ────────────────────────────
// Only sets priority if the user hasn't explicitly changed it,
// so an admin can override (e.g. info type with high priority).
announcementSchema.pre('save', function (next) {
  if (this.type === 'urgent') {
    this.isUrgent = true;
    // Only auto-set priority if not explicitly modified by caller
    if (!this.isModified('priority')) this.priority = 'critical';
  } else if (this.type === 'warning') {
    this.isUrgent = false;
    if (!this.isModified('priority')) this.priority = 'high';
  } else {
    this.isUrgent = false;
    if (!this.isModified('priority')) this.priority = this.type === 'success' ? 'medium' : 'low';
  }
  next();
});

// ── Instance method: should this user see this announcement? ──────────────────
// NOTE: also filter at query level with:
//   { isActive: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }
announcementSchema.methods.shouldUserSee = function (userId, userRoleId) {
  if (!this.isActive) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  if (this.targetAudience === 'all') return true;
  if (this.targetAudience === 'role')
    return this.targetRoles.some(r => r.toString() === String(userRoleId));
  if (this.targetAudience === 'specific')
    return this.targetUsers.some(u => u.toString() === String(userId));
  return false;
};

module.exports          = mongoose.model('Announcement', announcementSchema);
module.exports.AnnouncementRead = AnnouncementRead;



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
//     enum: ['info', 'warning', 'success', 'urgent'], // ✅ Angular expects 'urgent' not 'error'
//     default: 'info'
//   },
  
//   // --- TARGETING LOGIC ---
//   targetAudience: {
//     type: String,
//     enum: ['all', 'role', 'specific'],
//     default: 'all',
//     required: true
//   },
  
//   targetRoles: [{
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Role'
//   }],
  
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
//     type: String,
//     enum: ['low', 'medium', 'high', 'critical'],
//     default: 'medium'
//   },
  
//   isUrgent: {
//     type: Boolean,
//     default: false
//   },
  
//   expiresAt: {
//     type: Date
//   },
  
//   isActive: {
//     type: Boolean,
//     default: true,
//     index: true
//   }
// }, { 
//   timestamps: true,
//   toJSON: { virtuals: true },
//   toObject: { virtuals: true }
// });

// // ✅ Virtual field for Angular compatibility
// announcementSchema.virtual('data').get(function() {
//   return {
//     _id: this._id,
//     title: this.title,
//     message: this.message,
//     type: this.type,
//     senderId: this.senderId,
//     organizationId: this.organizationId,
//     createdAt: this.createdAt
//   };
// });

// // ✅ Indexes for performance
// announcementSchema.index({ organizationId: 1, isActive: 1, createdAt: -1 });
// announcementSchema.index({ organizationId: 1, isActive: 1, isUrgent: -1, priority: -1 });
// announcementSchema.index({ targetAudience: 1, organizationId: 1 });

// // ✅ Pre-save middleware
// announcementSchema.pre('save', function(next) {
//   // Set isUrgent based on type
//   if (this.type === 'urgent') {
//     this.isUrgent = true;
//     this.priority = 'critical';
//   } else if (this.type === 'warning') {
//     this.priority = 'high';
//   } else if (this.type === 'success') {
//     this.priority = 'medium';
//   } else {
//     this.priority = 'low';
//   }
  
//   next();
// });

// // ✅ Instance method to check if user should see announcement
// announcementSchema.methods.shouldUserSee = function(userId, userRoleId) {
//   if (!this.isActive) return false;
  
//   if (this.expiresAt && this.expiresAt < new Date()) return false;
  
//   if (this.targetAudience === 'all') return true;
  
//   if (this.targetAudience === 'role') {
//     return this.targetRoles.some(roleId => roleId.toString() === userRoleId.toString());
//   }
  
//   if (this.targetAudience === 'specific') {
//     return this.targetUsers.some(targetUserId => targetUserId.toString() === userId.toString());
//   }
  
//   return false;
// };

// module.exports = mongoose.model('Announcement', announcementSchema);


// // const mongoose = require('mongoose');

// // const announcementSchema = new mongoose.Schema({
// //   organizationId: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'Organization',
// //     required: true,
// //     index: true
// //   },
// //   senderId: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'User',
// //     required: true
// //   },
// //   title: {
// //     type: String,
// //     required: true,
// //     trim: true
// //   },
// //   message: {
// //     type: String,
// //     required: true
// //   },
// //   type: {
// //     type: String,
// //     enum: ['info', 'warning', 'success', 'urgent'],
// //     default: 'info'
// //   },
// //   // --- UPDATED TARGETING LOGIC ---
// //   targetAudience: {
// //     type: String,
// //     // 'all' = everyone in org
// //     // 'role' = specific roles (e.g., Admin, HR)
// //     // 'specific' = specific list of user IDs
// //     enum: ['all', 'role', 'specific'],
// //     default: 'all',
// //     required: true
// //   },
// //   // Stores Role IDs if targetAudience === 'role'
// //   targetRoles: [{
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'Role'
// //   }],
// //   // Stores User IDs if targetAudience === 'specific'
// //   targetUsers: [{
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'User'
// //   }],
// //   readBy: [{
// //     userId: {
// //       type: mongoose.Schema.Types.ObjectId,
// //       ref: 'User'
// //     },
// //     readAt: {
// //       type: Date,
// //       default: Date.now
// //     }
// //   }],
// //   isPinned: {
// //     type: Boolean,
// //     default: false
// //   },
// //   priority: {
// //   type: String,
// //   enum: ['low', 'medium', 'high', 'critical'],
// //   default: 'medium'
// // },

// // // In createAnnouncement
// // isUrgent: {
// //   type: Boolean,
// //   default: false
// // },

// //   // -------------------------------
// //   expiresAt: {
// //     type: Date
// //   },
// //   isActive: {
// //     type: Boolean,
// //     default: true
// //   }
// // }, { timestamps: true });

// // module.exports = mongoose.model('Announcement', announcementSchema);
