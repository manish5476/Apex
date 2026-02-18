const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const machineSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  serialNumber: { type: String, required: true, unique: true, trim: true },
  model: String,
  manufacturer: String,
  firmwareVersion: String,
  
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

  // --- Security ---
  apiKey: { type: String, select: false, required: true },
  apiKeyExpires: Date,
  apiKeyLastUsed: Date,
  
  ipAddress: { type: String, index: true },
  macAddress: String,
  
  // --- Configuration ---
  providerType: { 
    type: String, 
    enum: ['generic', 'zkteco', 'hikvision', 'essl', 'bioenable', 'suprema'], 
    default: 'generic' 
  },
  
  connectionProtocol: {
    type: String,
    enum: ['tcp', 'http', 'websocket', 'mqtt', 'usb'],
    default: 'http'
  },
  
  port: Number,
  timeout: { type: Number, default: 5000 },
  
  // --- Status & Sync ---
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'maintenance', 'offline', 'error'], 
    default: 'active',
    index: true 
  },
  
  connectionStatus: {
    type: String,
    enum: ['online', 'offline', 'connecting', 'disconnected'],
    default: 'offline'
  },
  
  lastSyncAt: Date,
  lastPingAt: Date,
  lastError: String,
  
  // --- Capabilities ---
  capabilities: {
    faceRecognition: { type: Boolean, default: false },
    fingerprint: { type: Boolean, default: true },
    rfid: { type: Boolean, default: false },
    temperature: { type: Boolean, default: false },
    maskDetection: { type: Boolean, default: false }
  },

  // --- Statistics ---
  stats: {
    totalTransactions: { type: Number, default: 0 },
    successfulReads: { type: Number, default: 0 },
    failedReads: { type: Number, default: 0 },
    lastTransactionAt: Date
  },

  // --- Configuration ---
  config: {
    timezone: { type: String, default: 'Asia/Kolkata' },
    syncInterval: { type: Number, default: 5 }, // minutes
    retryAttempts: { type: Number, default: 3 },
    autoSync: { type: Boolean, default: true }
  },

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true });

// --- INDEXES ---
machineSchema.index({ organizationId: 1, branchId: 1 });
machineSchema.index({ status: 1, lastPingAt: 1 });

// --- MIDDLEWARE ---
machineSchema.pre('save', async function(next) {
  // Generate API key if new
  if (this.isNew && !this.apiKey) {
    this.apiKey = crypto.randomBytes(32).toString('hex');
  }
  
  // Hash API key if modified
  if (this.isModified('apiKey')) {
    this.apiKey = await bcrypt.hash(this.apiKey, 10);
  }
  
  next();
});

// --- METHODS ---
machineSchema.methods.verifyApiKey = async function(candidateKey) {
  return await bcrypt.compare(candidateKey, this.apiKey);
};

machineSchema.methods.updatePing = function() {
  this.lastPingAt = new Date();
  this.connectionStatus = 'online';
  return this.save();
};

module.exports = mongoose.model('AttendanceMachine', machineSchema);
// const mongoose = require('mongoose');

// const machineSchema = new mongoose.Schema({
//   name: { type: String, required: true, trim: true },
//   serialNumber: { type: String, required: true, unique: true, trim: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  
//   apiKey: { type: String, select: false, required: true },
//   ipAddress: { type: String }, 
//   providerType: { type: String, enum: ['generic', 'zkteco', 'hikvision', 'essl'], default: 'generic' },
//   status: { type: String, enum: ['active', 'inactive', 'maintenance'], default: 'active' },
//   lastSyncAt: Date
// }, { timestamps: true });

// module.exports = mongoose.model('AttendanceMachine', machineSchema);