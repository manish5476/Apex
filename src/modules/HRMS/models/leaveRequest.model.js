const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
  leaveType: {
    type: String,
    enum: ['sick', 'casual', 'earned', 'maternity', 'paternity', 'unpaid'],
    required: true
  },
  
  startDate: { type: String, required: true }, 
  endDate: { type: String, required: true },   
  daysCount: { type: Number, required: true }, 
  reason: { type: String, required: true },
  
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: String,
  balanceSnapshot: { type: Number }, // Balance before this leave
  impactedDates: [String] 
}, { timestamps: true });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);