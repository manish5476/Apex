const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema({
  machineId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AttendanceMachine',
    required: true
  },
  // The ID sent by the hardware (e.g., "1001")
  rawUserId: { 
    type: String, 
    required: true,
    index: true 
  }, 
  // The resolved MongoDB User ID (populated by our controller)
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    index: true
  }, 
  
  timestamp: { type: Date, required: true }, // The time the USER scanned
  serverTimestamp: { type: Date, default: Date.now }, // The time WE received it
  
  type: { 
    type: String, 
    enum: ['in', 'out', 'break_start', 'break_end', 'unknown'],
    default: 'unknown'
  },
  
  verificationMode: { type: String }, // fingerprint, face, card, password
  
  processingStatus: { 
    type: String, 
    enum: ['pending', 'processed', 'failed', 'orphan'], 
    default: 'pending' 
  },
  
  // Store the exact JSON sent by the machine for debugging
  metadata: { type: mongoose.Schema.Types.Mixed } 
});

// Compound index for rapid reporting
attendanceLogSchema.index({ user: 1, timestamp: 1 });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);
