const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  
  leaveType: {
    type: String,
    enum: ['sick', 'casual', 'earned', 'maternity', 'paternity', 'unpaid'],
    required: true
  },
  
  startDate: { type: String, required: true }, // YYYY-MM-DD
  endDate: { type: String, required: true },   // YYYY-MM-DD
  daysCount: { type: Number, required: true }, // e.g., 0.5 or 2
  
  reason: { type: String, required: true },
  
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: String,
  
  // Link to specific days in AttendanceDaily once approved
  impactedDates: [String] 

}, { timestamps: true });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
