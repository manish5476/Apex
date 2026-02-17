const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema({
  source: { type: String, enum: ['machine', 'web', 'mobile', 'admin_manual', 'api'], required: true },
  machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceMachine' },
  
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
  timestamp: { type: Date, required: true, index: true },
  serverTimestamp: { type: Date, default: Date.now },
  timezone: String,
  
  type: { type: String, enum: ['in', 'out', 'break_start', 'break_end', 'remote_in', 'remote_out'], required: true },
  
  ipAddress: String,
  userAgent: String,
  deviceId: String,
  
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number], 
    accuracy: Number,
    address: String,
    geofenceStatus: { type: String, enum: ['inside', 'outside', 'disabled'] }
  },
  
  isVerified: { type: Boolean, default: false },
  processingStatus: { type: String, enum: ['pending', 'processed', 'flagged', 'rejected', 'corrected'], default: 'pending' },
  imageUrl: String,
}, { timestamps: true });

attendanceLogSchema.index({ 'location.coordinates': '2dsphere' });
attendanceLogSchema.index({ user: 1, timestamp: 1 });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);