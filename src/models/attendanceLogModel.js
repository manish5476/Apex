const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema({
  // --- Source Identification ---
  source: {
    type: String,
    enum: ['machine', 'web', 'mobile', 'admin_manual'], // Added 'web' and 'mobile'
    required: true,
    default: 'machine'
  },
  
  // If source is 'machine', this is required. If 'web', it is null.
  machineId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AttendanceMachine' 
  },

  // --- User Link ---
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
    index: true
  },
  
  // --- Time & Type ---
  timestamp: { type: Date, required: true }, 
  serverTimestamp: { type: Date, default: Date.now }, 
  
  type: { 
    type: String, 
    enum: ['in', 'out', 'break_start', 'break_end'],
    required: true
  },

  // --- 🔴 SECURITY: Web/Mobile Proof ---
  // Mandatory if source is 'web' or 'mobile'
  ipAddress: String,
  userAgent: String,
  
  location: {
    latitude: Number,
    longitude: Number,
    accuracy: Number, // in meters
    address: String // Optional reverse geocoding
  },
  
  isGeoFenced: { type: Boolean, default: false }, // True if user was within valid range
  distanceFromBranch: Number, // Store how far they were from office (meters)

  processingStatus: { 
    type: String, 
    enum: ['processed', 'flagged', 'rejected'], 
    default: 'processed' 
  }

});

attendanceLogSchema.index({ user: 1, timestamp: 1 });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);// const mongoose = require('mongoose');

// const attendanceLogSchema = new mongoose.Schema({
//   machineId: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     ref: 'AttendanceMachine',
//     required: true
//   },
//   // The ID sent by the hardware (e.g., "1001")
//   rawUserId: { 
//     type: String, 
//     required: true,
//     index: true 
//   }, 
//   // The resolved MongoDB User ID (populated by our controller)
//   user: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     ref: 'User',
//     index: true
//   }, 
  
//   timestamp: { type: Date, required: true }, // The time the USER scanned
//   serverTimestamp: { type: Date, default: Date.now }, // The time WE received it
  
//   type: { 
//     type: String, 
//     enum: ['in', 'out', 'break_start', 'break_end', 'unknown'],
//     default: 'unknown'
//   },
  
//   verificationMode: { type: String }, // fingerprint, face, card, password
  
//   processingStatus: { 
//     type: String, 
//     enum: ['pending', 'processed', 'failed', 'orphan'], 
//     default: 'pending' 
//   },
  
//   // Store the exact JSON sent by the machine for debugging
//   metadata: { type: mongoose.Schema.Types.Mixed } 
// });

// // Compound index for rapid reporting
// attendanceLogSchema.index({ user: 1, timestamp: 1 });

// module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);
