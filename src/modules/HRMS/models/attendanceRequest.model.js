const mongoose = require('mongoose');

const attendanceRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
  targetDate: { type: String, required: true },
  type: { type: String, enum: ['missed_punch', 'correction', 'work_from_home', 'on_duty', 'others'], required: true },
  
  correction: {
    newFirstIn: Date,
    newLastOut: Date,
    reason: { type: String, required: true },
    supportingDocs: [String]
  },
  
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectionReason: String,
}, { timestamps: true });

attendanceRequestSchema.index({ user: 1, targetDate: 1, status: 1 }, { 
  unique: true, 
  partialFilterExpression: { status: { $in: ['pending'] } } 
});

module.exports = mongoose.model('AttendanceRequest', attendanceRequestSchema);