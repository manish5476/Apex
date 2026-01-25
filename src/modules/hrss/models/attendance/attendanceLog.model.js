const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema({
  // Source Information
  source: {
    type: String,
    enum: ['machine', 'web', 'mobile', 'admin_manual', 'api'],
    required: true,
    index: true
  },
  machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceMachine' },
  
  // User & Organization
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
  // Timing
  timestamp: { type: Date, required: true, index: true },
  serverTimestamp: { type: Date, default: Date.now },
  timezone: String,
  
  // Punch Type
  type: { 
    type: String, 
    enum: ['in', 'out', 'break_start', 'break_end', 'remote_in', 'remote_out'],
    required: true
  },
  
  // Location & Device
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number],
    accuracy: Number,
    address: String,
    geofenceStatus: { type: String, enum: ['inside', 'outside', 'disabled'] }
  },
  ipAddress: String,
  userAgent: String,
  deviceId: String,
  
  // Verification
  isVerified: { type: Boolean, default: false },
  verificationMethod: { type: String, enum: ['auto', 'manager', 'admin'] },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Processing
  processingStatus: { 
    type: String, 
    enum: ['pending', 'processed', 'flagged', 'rejected', 'corrected', 'orphan'], 
    default: 'pending',
    index: true
  },
  processingNotes: String,
  
  // Raw Data
  rawData: mongoose.Schema.Types.Mixed,
  imageUrl: String,
  rawUserId: String,
  
  // References
  correctedByLog: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' },
  attendanceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceRequest' },
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
attendanceLogSchema.index({ 'location.coordinates': '2dsphere' });
attendanceLogSchema.index({ user: 1, timestamp: 1 });
attendanceLogSchema.index({ organizationId: 1, processingStatus: 1 });
attendanceLogSchema.index({ machineId: 1, timestamp: 1 });

// Virtual for formatted time
attendanceLogSchema.virtual('formattedTime').get(function() {
  return this.timestamp ? this.timestamp.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  }) : '';
});

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);