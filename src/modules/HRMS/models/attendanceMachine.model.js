const mongoose = require('mongoose');

const machineSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  serialNumber: { type: String, required: true, unique: true, trim: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  
  apiKey: { type: String, select: false, required: true },
  ipAddress: { type: String }, 
  providerType: { type: String, enum: ['generic', 'zkteco', 'hikvision', 'essl'], default: 'generic' },
  status: { type: String, enum: ['active', 'inactive', 'maintenance'], default: 'active' },
  lastSyncAt: Date
}, { timestamps: true });

module.exports = mongoose.model('AttendanceMachine', machineSchema);