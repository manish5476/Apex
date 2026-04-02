const mongoose = require('mongoose');
const { VALID_TAGS } = require('../../../config/permissions');

// ── Business type → UI type mapping (single source of truth) ─────────────────
// Keep in sync with NotificationService.BUSINESS_TYPE_MAP
const BUSINESS_TYPE_UI_MAP = {
  USER_SIGNUP:          'info',
  INVOICE_CREATED:      'info',
  PAYMENT_RECEIVED:     'success',
  PAYMENT_OVERDUE:      'error',
  STOCK_ALERT:          'warning',
  STOCK_ALERT_CRITICAL: 'error',
  TASK:                 'info',
  TASK_OVERDUE:         'error',
  TASK_COMPLETED:       'success',
  SYSTEM:               'info',
};

const BUSINESS_TYPES = Object.keys(BUSINESS_TYPE_UI_MAP);
const UI_TYPES       = ['info', 'success', 'warning', 'error', 'urgent'];

const notificationSchema = new mongoose.Schema(
  {
    organizationId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Organization',
      required: true,
      index:    true,
    },
    recipientId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },

    // Business classification — what triggered this notification
    businessType: {
      type:     String,
      enum:     { values: BUSINESS_TYPES, message: 'Invalid businessType: {VALUE}' },
      required: true,
    },

    // UI display type — derived from businessType in pre-validate hook
    // Never set manually; always derived
    type: {
      type:    String,
      enum:    { values: UI_TYPES, message: 'Invalid type: {VALUE}' },
      // No default here — pre-validate sets it from businessType
    },

    title:   { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    // Arbitrary context data for frontend navigation (e.g. invoiceId, userId)
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    priority: {
      type:    String,
      enum:    ['low', 'normal', 'high', 'critical'],
      default: 'normal',
    },

    isRead:   { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },

    readAt: { type: Date },
    readBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Primary query: user's notification feed (unread first, newest first)
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

// Org-level queries (admin views)
notificationSchema.index({ organizationId: 1, createdAt: -1 });

// Filter by type + read status
notificationSchema.index({ recipientId: 1, type: 1, isRead: 1 });

// TTL index — auto-delete notifications older than 90 days
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

// ── Virtual: entityType for Angular navigation ────────────────────────────────
const ENTITY_TYPE_MAP = {
  USER_SIGNUP:          'user',
  INVOICE_CREATED:      'invoice',
  PAYMENT_RECEIVED:     'payment',
  PAYMENT_OVERDUE:      'payment',
  STOCK_ALERT:          'inventory',
  STOCK_ALERT_CRITICAL: 'inventory',
  TASK:                 'task',
  TASK_OVERDUE:         'task',
  TASK_COMPLETED:       'task',
  SYSTEM:               null,
};

notificationSchema.virtual('entityType').get(function () {
  return ENTITY_TYPE_MAP[this.businessType] ?? null;
});

// ── Pre-validate: derive `type` from businessType ─────────────────────────────
// Runs before validation so `type` is always set and passes the enum check.
notificationSchema.pre('validate', function (next) {
  // Always re-derive from businessType — never trust a manually-set type
  if (this.businessType) {
    this.type = BUSINESS_TYPE_UI_MAP[this.businessType] || 'info';
  }
  next();
});

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports          = mongoose.model('Notification', notificationSchema);
module.exports.BUSINESS_TYPES       = BUSINESS_TYPES;
module.exports.BUSINESS_TYPE_UI_MAP = BUSINESS_TYPE_UI_MAP;






// const mongoose = require("mongoose");


// const notificationSchema = new mongoose.Schema(
//   {
//     organizationId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Organization",
//       required: true,
//       index: true
//     },
//     recipientId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//       index: true
//     },
    
//     // ✅ KEEP your business types but add the UI types Angular expects
//     businessType: {
//       type: String,
//       enum: ["USER_SIGNUP", "INVOICE_CREATED", "PAYMENT_RECEIVED", "STOCK_ALERT", "SYSTEM", "TASK"],
//       required: true,
//     },
    
//     // ✅ ADD this for Angular UI compatibility
//     type: {
//       type: String,
//       enum: ['info', 'success', 'warning', 'error', 'urgent'],
//       default: 'info',
//       required: true
//     },
    
//     title: { 
//       type: String, 
//       required: true,
//       trim: true
//     },
//     message: { 
//       type: String, 
//       required: true,
//       trim: true
//     },
    
//     // ✅ Context Data for navigation
//     metadata: {
//       type: mongoose.Schema.Types.Mixed,
//       default: {}
//     },

//     // ✅ Importance Level
//     priority: {
//       type: String,
//       enum: ['low', 'normal', 'high', 'critical'],
//       default: 'normal'
//     },

//     isRead: { 
//       type: Boolean, 
//       default: false, 
//       index: true 
//     },
    
//     isSystem: {
//       type: Boolean,
//       default: false
//     },
    
//     // ✅ ADD these for Angular compatibility
//     readAt: {
//       type: Date
//     },
//     readBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User'
//     },
    
//     createdBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User'
//     }
//   },
//   { 
//     timestamps: true,
//     toJSON: { virtuals: true },
//     toObject: { virtuals: true }
//   }
// );

// // ✅ Add virtual field for compatibility
// notificationSchema.virtual('entityType').get(function() {
//   // Map businessType to entityType for navigation
//   const map = {
//     'USER_SIGNUP': 'user',
//     'INVOICE_CREATED': 'invoice',
//     'PAYMENT_RECEIVED': 'payment',
//     'STOCK_ALERT': 'inventory',
//     'TASK': 'task'
//   };
//   return map[this.businessType] || null;
// });

// // ✅ Indexes for performance
// notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
// notificationSchema.index({ organizationId: 1, createdAt: -1 });
// notificationSchema.index({ type: 1, isRead: 1 });

// // ✅ Pre-save middleware to set type from businessType if not provided
// notificationSchema.pre('save', function(next) {
//   if (!this.type && this.businessType) {
//     // Map business types to UI types
//     const typeMap = {
//       'USER_SIGNUP': 'info',
//       'INVOICE_CREATED': 'info',
//       'PAYMENT_RECEIVED': 'success',
//       'STOCK_ALERT': 'warning',
//       'SYSTEM': 'info',
//       'TASK': 'info'
//     };
//     this.type = typeMap[this.businessType] || 'info';
//   }
  
//   // Set priority based on type
//   if (this.type === 'urgent' || this.type === 'error') {
//     this.priority = 'critical';
//   } else if (this.type === 'warning') {
//     this.priority = 'high';
//   }
  
//   next();
// });

// module.exports = mongoose.model("Notification", notificationSchema);


// // const mongoose = require("mongoose");

// // const notificationSchema = new mongoose.Schema(
// //   {
// //     organizationId: {
// //       type: mongoose.Schema.Types.ObjectId,
// //       ref: "Organization",
// //       required: true,
// //       index: true
// //     },
// //     recipientId: {
// //       type: mongoose.Schema.Types.ObjectId,
// //       ref: "User",
// //       required: true,
// //       index: true
// //     },
    
// //     // Broad categories for filtering
// //     type: {
// //       type: String,
// //       enum: ["USER_SIGNUP", "INVOICE_CREATED", "PAYMENT_RECEIVED", "STOCK_ALERT", "SYSTEM", "TASK"],
// //       required: true,
// //     },
    
// //     title: { type: String, required: true },
// //     message: { type: String, required: true },
    
// //     // ✅ NEW: Context Data (For clicking -> navigation)
// //     // Example: { entityId: "inv_123", entityType: "invoice", action: "view" }
// //     metadata: {
// //       type: Map,
// //       of: String
// //     },

// //     // ✅ NEW: Importance Level
// //     priority: {
// //       type: String,
// //       enum: ['low', 'normal', 'high', 'critical'],
// //       default: 'normal'
// //     },

// //     isRead: { type: Boolean, default: false, index: true },
// //   },
// //   { timestamps: true }
// // );

// // module.exports = mongoose.model("Notification", notificationSchema);
