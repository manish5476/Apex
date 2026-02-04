const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    
    // ✅ KEEP your business types but add the UI types Angular expects
    businessType: {
      type: String,
      enum: ["USER_SIGNUP", "INVOICE_CREATED", "PAYMENT_RECEIVED", "STOCK_ALERT", "SYSTEM", "TASK"],
      required: true,
    },
    
    // ✅ ADD this for Angular UI compatibility
    type: {
      type: String,
      enum: ['info', 'success', 'warning', 'error', 'urgent'],
      default: 'info',
      required: true
    },
    
    title: { 
      type: String, 
      required: true,
      trim: true
    },
    message: { 
      type: String, 
      required: true,
      trim: true
    },
    
    // ✅ Context Data for navigation
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // ✅ Importance Level
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'critical'],
      default: 'normal'
    },

    isRead: { 
      type: Boolean, 
      default: false, 
      index: true 
    },
    
    isSystem: {
      type: Boolean,
      default: false
    },
    
    // ✅ ADD these for Angular compatibility
    readAt: {
      type: Date
    },
    readBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ✅ Add virtual field for compatibility
notificationSchema.virtual('entityType').get(function() {
  // Map businessType to entityType for navigation
  const map = {
    'USER_SIGNUP': 'user',
    'INVOICE_CREATED': 'invoice',
    'PAYMENT_RECEIVED': 'payment',
    'STOCK_ALERT': 'inventory',
    'TASK': 'task'
  };
  return map[this.businessType] || null;
});

// ✅ Indexes for performance
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, isRead: 1 });

// ✅ Pre-save middleware to set type from businessType if not provided
notificationSchema.pre('save', function(next) {
  if (!this.type && this.businessType) {
    // Map business types to UI types
    const typeMap = {
      'USER_SIGNUP': 'info',
      'INVOICE_CREATED': 'info',
      'PAYMENT_RECEIVED': 'success',
      'STOCK_ALERT': 'warning',
      'SYSTEM': 'info',
      'TASK': 'info'
    };
    this.type = typeMap[this.businessType] || 'info';
  }
  
  // Set priority based on type
  if (this.type === 'urgent' || this.type === 'error') {
    this.priority = 'critical';
  } else if (this.type === 'warning') {
    this.priority = 'high';
  }
  
  next();
});

module.exports = mongoose.model("Notification", notificationSchema);


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
    
//     // Broad categories for filtering
//     type: {
//       type: String,
//       enum: ["USER_SIGNUP", "INVOICE_CREATED", "PAYMENT_RECEIVED", "STOCK_ALERT", "SYSTEM", "TASK"],
//       required: true,
//     },
    
//     title: { type: String, required: true },
//     message: { type: String, required: true },
    
//     // ✅ NEW: Context Data (For clicking -> navigation)
//     // Example: { entityId: "inv_123", entityType: "invoice", action: "view" }
//     metadata: {
//       type: Map,
//       of: String
//     },

//     // ✅ NEW: Importance Level
//     priority: {
//       type: String,
//       enum: ['low', 'normal', 'high', 'critical'],
//       default: 'normal'
//     },

//     isRead: { type: Boolean, default: false, index: true },
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("Notification", notificationSchema);
