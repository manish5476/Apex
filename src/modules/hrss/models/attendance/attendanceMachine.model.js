const mongoose = require('mongoose');
const crypto = require('crypto');

const machineSchema = new mongoose.Schema({
  // Identification
  name: { 
    type: String, 
    required: [true, 'Machine name is required'],
    trim: true,
    maxlength: 100
  },
  serialNumber: { 
    type: String, 
    required: [true, 'Serial Number is required'], 
    unique: true,
    trim: true,
    uppercase: true
  },
  model: String,
  manufacturer: String,
  
  // Organization & Location
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true,
    index: true 
  },
  branchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch', 
    required: true,
    index: true 
  },
  
  // Authentication
  apiKey: { 
    type: String, 
    select: false,
    unique: true,
    required: [true, 'API Key is required']
  },
  apiSecret: { 
    type: String, 
    select: false 
  },
  
  // Network Configuration
  ipAddress: { 
    type: String,
    validate: {
      validator: function(v) {
        return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(v);
      },
      message: 'Invalid IP address'
    }
  },
  macAddress: String,
  subnetMask: String,
  gateway: String,
  dns: String,
  
  // Hardware Details
  providerType: { 
    type: String, 
    enum: ['generic', 'zkteco', 'hikvision', 'essl', 'mantra', 'idtech'], 
    default: 'generic' 
  },
  firmwareVersion: String,
  hardwareVersion: String,
  capacity: Number, // Max users
  storage: Number, // In MB
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'maintenance', 'offline', 'faulty'], 
    default: 'active',
    index: true 
  },
  lastSeen: Date,
  lastSyncAt: Date,
  
  // Synchronization
  syncInterval: { type: Number, default: 5 }, // Minutes
  syncMethod: { 
    type: String, 
    enum: ['push', 'pull', 'both'], 
    default: 'push' 
  },
  syncStatus: { 
    type: String, 
    enum: ['syncing', 'idle', 'failed', 'pending'], 
    default: 'idle' 
  },
  
  // Statistics
  syncCount: { type: Number, default: 0 },
  totalLogs: { type: Number, default: 0 },
  failedSyncs: { type: Number, default: 0 },
  lastError: String,
  lastErrorAt: Date,
  
  // Configuration
  timezone: { type: String, default: 'Asia/Kolkata' },
  language: { type: String, default: 'en' },
  dateFormat: { type: String, default: 'YYYY-MM-DD' },
  timeFormat: { type: String, default: '24h' },
  
  // Communication
  communicationProtocol: { 
    type: String, 
    enum: ['tcp', 'udp', 'http', 'https', 'serial'], 
    default: 'tcp' 
  },
  port: { type: Number, default: 4370 },
  baudRate: { type: Number, default: 9600 },
  
  // Features
  features: {
    biometric: { type: Boolean, default: true },
    rfid: { type: Boolean, default: false },
    fingerprint: { type: Boolean, default: true },
    faceRecognition: { type: Boolean, default: false },
    palmVein: { type: Boolean, default: false },
    temperature: { type: Boolean, default: false },
    maskDetection: { type: Boolean, default: false }
  },
  
  // Location
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number], // [longitude, latitude]
    floor: String,
    room: String,
    description: String
  },
  
  // Maintenance
  lastMaintenance: Date,
  nextMaintenance: Date,
  maintenanceNotes: String,
  warrantyExpiry: Date,
  
  // Audit
  installedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  installedAt: Date,
  configuredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  configuredAt: Date,
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
machineSchema.index({ organizationId: 1, branchId: 1, status: 1 });
machineSchema.index({ serialNumber: 1 }, { unique: true });
machineSchema.index({ 'location.coordinates': '2dsphere' });
machineSchema.index({ ipAddress: 1, organizationId: 1 }, { unique: true, sparse: true });

// Virtuals
machineSchema.virtual('uptime').get(function() {
  if (!this.lastSeen) return 0;
  return Math.floor((new Date() - this.lastSeen) / (1000 * 60)); // Minutes
});

machineSchema.virtual('isOnline').get(function() {
  if (!this.lastSeen) return false;
  const minutesSinceLastSeen = (new Date() - this.lastSeen) / (1000 * 60);
  return minutesSinceLastSeen < 15; // Consider online if seen within 15 minutes
});

machineSchema.virtual('syncHealth').get(function() {
  if (this.failedSyncs > 10) return 'critical';
  if (this.failedSyncs > 5) return 'warning';
  return 'healthy';
});

// Pre-save middleware
machineSchema.pre('save', function(next) {
  // Generate API key if not present
  if (!this.apiKey) {
    this.apiKey = `mch_${crypto.randomBytes(32).toString('hex')}`;
  }
  
  // Generate API secret if not present
  if (!this.apiSecret) {
    this.apiSecret = crypto.randomBytes(64).toString('hex');
  }
  
  // Update lastSeen if status changed to active
  if (this.isModified('status') && this.status === 'active') {
    this.lastSeen = new Date();
  }
  
  next();
});

// Instance method to generate auth token
machineSchema.methods.generateAuthToken = function() {
  const timestamp = Date.now();
  const message = `${this.apiKey}:${timestamp}`;
  const hmac = crypto.createHmac('sha256', this.apiSecret);
  hmac.update(message);
  const signature = hmac.digest('hex');
  
  return {
    apiKey: this.apiKey,
    timestamp,
    signature
  };
};

// Instance method to validate signature
machineSchema.methods.validateSignature = function(timestamp, signature) {
  const message = `${this.apiKey}:${timestamp}`;
  const hmac = crypto.createHmac('sha256', this.apiSecret);
  hmac.update(message);
  const expectedSignature = hmac.digest('hex');
  
  // Check if timestamp is recent (within 5 minutes)
  const isRecent = Date.now() - parseInt(timestamp) < 5 * 60 * 1000;
  
  return isRecent && crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
};

// Static method to authenticate
machineSchema.statics.authenticate = async function(apiKey, signature, timestamp) {
  const machine = await this.findOne({ apiKey }).select('+apiKey +apiSecret');
  
  if (!machine || machine.status !== 'active') {
    return null;
  }
  
  if (!machine.validateSignature(timestamp, signature)) {
    return null;
  }
  
  // Update last seen
  machine.lastSeen = new Date();
  await machine.save();
  
  return machine;
};

module.exports = mongoose.model('AttendanceMachine', machineSchema);