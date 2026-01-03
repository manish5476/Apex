const mongoose = require('mongoose');

const attendanceRequestSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },

  // The date they want to fix
  targetDate: { type: String, required: true }, // "YYYY-MM-DD"
  
  type: {
    type: String,
    enum: ['missed_punch', 'on_duty', 'work_from_home', 'leave_reversal'],
    required: true
  },

  // The correction data
  correction: {
    newFirstIn: Date,
    newLastOut: Date,
    reason: { type: String, required: true, minlength: 10 }
  },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },

  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectionReason: String

}, { timestamps: true });

// Prevent duplicate pending requests for the same day
attendanceRequestSchema.index({ user: 1, targetDate: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

module.exports = mongoose.model('AttendanceRequest', attendanceRequestSchema);
