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
    
    // Broad categories for filtering
    type: {
      type: String,
      enum: ["USER_SIGNUP", "INVOICE_CREATED", "PAYMENT_RECEIVED", "STOCK_ALERT", "SYSTEM", "TASK"],
      required: true,
    },
    
    title: { type: String, required: true },
    message: { type: String, required: true },
    
    // ✅ NEW: Context Data (For clicking -> navigation)
    // Example: { entityId: "inv_123", entityType: "invoice", action: "view" }
    metadata: {
      type: Map,
      of: String
    },

    // ✅ NEW: Importance Level
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'critical'],
      default: 'normal'
    },

    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);

// // models/notificationModel.js
// const mongoose = require("mongoose");

// const notificationSchema = new mongoose.Schema(
//   {
//     organizationId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Organization",
//       required: true,
//     },
//     recipientId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//     },
//     type: {
//       type: String,
//       enum: ["USER_SIGNUP", "INVOICE_CREATED", "PAYMENT_RECEIVED", "STOCK_ALERT"],
//       required: true,
//     },
//     title: String,
//     message: String,
//     isRead: { type: Boolean, default: false },
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("Notification", notificationSchema);
