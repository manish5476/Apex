const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema({
  // Source
  source: {
    type: String,
    enum: ['machine', 'web', 'mobile', 'admin_manual', 'api'],
    required: true
  },
  
  machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceMachine' },
  
  // User
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
  // Time
  timestamp: { type: Date, required: true, index: true },
  serverTimestamp: { type: Date, default: Date.now },
  timezone: String,
  
  // Type
  type: { 
    type: String, 
    enum: ['in', 'out', 'break_start', 'break_end', 'remote_in', 'remote_out'],
    required: true
  },
  
  // Security
  ipAddress: String,
  userAgent: String,
  deviceId: String,
  
  // Location
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number], // [longitude, latitude]
    accuracy: Number,
    address: String,
    geofenceStatus: { type: String, enum: ['inside', 'outside', 'disabled'] }
  },
  
  // Verification
  isVerified: { type: Boolean, default: false },
  verificationMethod: { type: String, enum: ['auto', 'manager', 'admin'] },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Processing
  processingStatus: { 
    type: String, 
    enum: ['pending', 'processed', 'flagged', 'rejected', 'corrected'], 
    default: 'pending' 
  },
  processingNotes: String,
  
  // Metadata
  rawData: mongoose.Schema.Types.Mixed, // Store original payload
  imageUrl: String, // For biometric face images
  
  // Relations
  correctedByLog: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' },
  attendanceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceRequest' },
  
}, { timestamps: true });

// Geo-spatial index for location queries
attendanceLogSchema.index({ 'location.coordinates': '2dsphere' });

// Performance indexes
attendanceLogSchema.index({ user: 1, timestamp: 1 });
attendanceLogSchema.index({ organizationId: 1, processingStatus: 1 });
attendanceLogSchema.index({ source: 1, timestamp: 1 });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);

// const mongoose = require('mongoose');

// const attendanceLogSchema = new mongoose.Schema({
//   // --- Source Identification ---
//   source: {
//     type: String,
//     enum: ['machine', 'web', 'mobile', 'admin_manual'], // Added 'web' and 'mobile'
//     required: true,
//     default: 'machine'
//   },
  
//   // If source is 'machine', this is required. If 'web', it is null.
//   machineId: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     ref: 'AttendanceMachine' 
//   },

//   // --- User Link ---
//   user: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     ref: 'User',
//     required: true,
//     index: true
//   },
  
//   // --- Time & Type ---
//   timestamp: { type: Date, required: true }, 
//   serverTimestamp: { type: Date, default: Date.now }, 
  
//   type: { 
//     type: String, 
//     enum: ['in', 'out', 'break_start', 'break_end'],
//     required: true
//   },

//   // --- 🔴 SECURITY: Web/Mobile Proof ---
//   // Mandatory if source is 'web' or 'mobile'
//   ipAddress: String,
//   userAgent: String,
  
//   location: {
//     latitude: Number,
//     longitude: Number,
//     accuracy: Number, // in meters
//     address: String // Optional reverse geocoding
//   },
  
//   isGeoFenced: { type: Boolean, default: false }, // True if user was within valid range
//   distanceFromBranch: Number, // Store how far they were from office (meters)

//   processingStatus: { 
//     type: String, 
//     enum: ['processed', 'flagged', 'rejected'], 
//     default: 'processed' 
//   }

// });

// attendanceLogSchema.index({ user: 1, timestamp: 1 });

// module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);// const mongoose = require('mongoose');
