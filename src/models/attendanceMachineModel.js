const mongoose = require('mongoose');

const machineSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Machine name is required'],
    trim: true 
  },
  serialNumber: { 
    type: String, 
    required: [true, 'Serial Number is required'], 
    unique: true,
    trim: true
  },
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true 
  },
  branchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch', 
    required: true 
  },
  
  // 🔴 SECURITY: The "Password" for the machine. 
  // Never expose this in API responses (select: false).
  apiKey: { 
    type: String, 
    select: false, 
    required: [true, 'API Key is required for device authentication'] 
  },
  
  // Optional: Restrict this machine to a specific static IP
  ipAddress: { type: String }, 

  providerType: { 
    type: String, 
    enum: ['generic', 'zkteco', 'hikvision', 'essl'], 
    default: 'generic' 
  },
  
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'maintenance'], 
    default: 'active' 
  },

  lastSyncAt: Date
}, { timestamps: true });

module.exports = mongoose.model('AttendanceMachine', machineSchema);
