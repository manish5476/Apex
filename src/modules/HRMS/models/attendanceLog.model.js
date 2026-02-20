
const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema({
  source: { 
    type: String, 
    enum: ['machine', 'web', 'mobile', 'admin_manual', 'api', 'biometric', 'rfid'], 
    required: true 
  },
  machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceMachine' },

  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

  timestamp: { type: Date, required: true, index: true },
  serverTimestamp: { type: Date, default: Date.now },
  timezone: String,

  type: { 
    type: String, 
    enum: ['in', 'out', 'break_start', 'break_end', 'remote_in', 'remote_out', 'overtime_in', 'overtime_out'], 
    required: true 
  },

  // --- Device Info ---
  ipAddress: String,
  userAgent: String,
  deviceId: String,
  deviceName: String,
  
  // --- Biometric Data ---
  biometricData: {
    templateId: String,
    confidence: { type: Number, min: 0, max: 100 },
    method: { type: String, enum: ['fingerprint', 'face', 'iris', 'palm'] }
  },

  // --- Location Data ---
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], index: '2dsphere' }, // [longitude, latitude]
    accuracy: Number,
    altitude: Number,
    address: String,
    geofenceStatus: { type: String, enum: ['inside', 'outside', 'disabled'] },
    geofenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GeoFence' }
  },

  // --- Verification & Processing ---
  isVerified: { type: Boolean, default: false },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
  
  processingStatus: { 
    type: String, 
    enum: ['pending', 'processed', 'flagged', 'rejected', 'corrected', 'duplicate'], 
    default: 'pending' 
  },
  
  // --- Media ---
  imageUrl: String,
  annotatedImageUrl: String, // For face recognition

  // --- Correction Tracking ---
  correctionRef: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceRequest' },
  isCorrection: { type: Boolean, default: false },
  originalLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' },

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String

}, { 
  timestamps: true,
  toJSON: { virtuals: true }
});

// --- INDEXES ---
attendanceLogSchema.index({ user: 1, timestamp: -1 });
attendanceLogSchema.index({ organizationId: 1, timestamp: -1, source: 1 });
attendanceLogSchema.index({ machineId: 1, timestamp: -1 });
attendanceLogSchema.index({ processingStatus: 1, createdAt: 1 });
attendanceLogSchema.index({ 'biometricData.templateId': 1 });

// --- METHODS ---
attendanceLogSchema.methods.markAsProcessed = async function(dailyRecordId) {
  this.processingStatus = 'processed';
  this.isVerified = true;
  await this.save();
};

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);// const mongoose = require('mongoose');
