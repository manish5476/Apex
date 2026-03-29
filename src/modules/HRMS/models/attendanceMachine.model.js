const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

const machineSchema = new mongoose.Schema({
  name:            { type: String, required: true, trim: true },
  serialNumber:    { type: String, required: true, unique: true, trim: true },
  model:           String,
  manufacturer:    String,
  firmwareVersion: String,

  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',       required: true, index: true },

  // --- Security ---
  // FIX BUG-AM-01 [CRITICAL] — apiKey is hashed for storage, but the plain-text key
  // was being generated AND immediately hashed in the same pre-save hook, meaning the
  // caller NEVER received the plain-text key. Machines could never be authenticated.
  //
  // Fix strategy (same as JWT refresh tokens):
  //   1. On creation, generate a plain-text key
  //   2. Store it temporarily in a non-persisted virtual (_plainTextApiKey)
  //   3. Hash and store in the database
  //   4. Caller reads _plainTextApiKey from the returned document ONCE and stores it securely
  //   5. On subsequent saves, only re-hash if the key field is explicitly changed
  apiKey: {
    type: String,
    select: false, // Never returned in queries unless explicitly requested
    required: true,
  },

  apiKeyExpires:  Date,
  apiKeyLastUsed: Date,

  ipAddress:  { type: String, index: true },
  macAddress: String,

  // --- Configuration ---
  providerType: {
    type: String,
    enum: ['generic', 'zkteco', 'hikvision', 'essl', 'bioenable', 'suprema'],
    default: 'generic',
  },

  connectionProtocol: {
    type: String,
    enum: ['tcp', 'http', 'websocket', 'mqtt', 'usb'],
    default: 'http',
  },

  port:    Number,
  timeout: { type: Number, default: 5000 },

  // --- Status & Sync ---
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance', 'offline', 'error'],
    default: 'active',
    index: true,
  },

  connectionStatus: {
    type: String,
    enum: ['online', 'offline', 'connecting', 'disconnected'],
    default: 'offline',
  },

  lastSyncAt:  Date,
  lastPingAt:  Date,
  lastError:   String,

  // --- Capabilities ---
  capabilities: {
    faceRecognition: { type: Boolean, default: false },
    fingerprint:     { type: Boolean, default: true  },
    rfid:            { type: Boolean, default: false },
    temperature:     { type: Boolean, default: false },
    maskDetection:   { type: Boolean, default: false },
  },

  // --- Statistics ---
  stats: {
    totalTransactions: { type: Number, default: 0 },
    successfulReads:   { type: Number, default: 0 },
    failedReads:       { type: Number, default: 0 },
    lastTransactionAt: Date,
  },

  // --- Configuration ---
  config: {
    timezone:      { type: String, default: 'Asia/Kolkata' },
    syncInterval:  { type: Number, default: 5 }, // minutes
    retryAttempts: { type: Number, default: 3 },
    autoSync:      { type: Boolean, default: true },
  },

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
machineSchema.index({ organizationId: 1, branchId: 1 });
machineSchema.index({ status: 1, lastPingAt: 1 });

// ─────────────────────────────────────────────
//  Virtual: _plainTextApiKey
// FIX BUG-AM-01 — Transient (non-persisted) virtual to hold the plain-text key
// between generation and the caller reading it. It is set by pre-save and read once.
// ─────────────────────────────────────────────
machineSchema.virtual('_plainTextApiKey');

// ─────────────────────────────────────────────
//  Pre-Save Middleware
// ─────────────────────────────────────────────
machineSchema.pre('save', async function (next) {
  try {
    if (this.isNew && !this.apiKey) {
      // FIX BUG-AM-01 [CRITICAL] — Generate plain-text key, expose via transient virtual,
      // THEN hash for storage. The caller reads machine._plainTextApiKey after save.
      const plainText = crypto.randomBytes(32).toString('hex');
      this._plainTextApiKey = plainText; // Transient — not saved to DB
      this.apiKey = await bcrypt.hash(plainText, 10);
    } else if (this.isModified('apiKey') && !this.isNew) {
      // Re-hash only when explicitly rotated (e.g. key regeneration endpoint)
      const plainText = this.apiKey; // Controller sets plain text, middleware hashes it
      this._plainTextApiKey = plainText;
      this.apiKey = await bcrypt.hash(plainText, 10);
    }
    next();
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  Methods
// ─────────────────────────────────────────────

/**
 * FIX BUG-AM-02 [HIGH] — Added apiKeyExpires check.
 * Original only did bcrypt.compare — an expired key would authenticate indefinitely.
 */
machineSchema.methods.verifyApiKey = async function (candidateKey) {
  // Check expiry first (fast, no bcrypt overhead)
  if (this.apiKeyExpires && this.apiKeyExpires < new Date()) {
    return false; // Key has expired
  }

  const isValid = await bcrypt.compare(candidateKey, this.apiKey);

  if (isValid) {
    // Update lastUsed without triggering full pre-save hooks
    await this.constructor.findByIdAndUpdate(this._id, {
      apiKeyLastUsed: new Date(),
    });
  }

  return isValid;
};

machineSchema.methods.updatePing = function () {
  this.lastPingAt       = new Date();
  this.connectionStatus = 'online';
  return this.save();
};

/**
 * FIX BUG-AM-03 [MEDIUM] — Added incrementStats() method.
 * The stats counters were never incremented anywhere — always stuck at 0.
 * Call this from the AttendanceLog post-save hook or the machine sync controller.
 *
 * @param {'success'|'failure'} outcome
 */
machineSchema.methods.incrementStats = async function (outcome = 'success') {
  const inc = { 'stats.totalTransactions': 1 };
  if (outcome === 'success') {
    inc['stats.successfulReads'] = 1;
  } else {
    inc['stats.failedReads'] = 1;
  }

  return this.constructor.findByIdAndUpdate(
    this._id,
    {
      $inc: inc,
      $set: { 'stats.lastTransactionAt': new Date() },
    },
    { new: true }
  );
};

/**
 * Regenerate API key — returns the new plain-text key.
 * Store it securely; it cannot be retrieved again after this call.
 */
machineSchema.methods.regenerateApiKey = async function () {
  const plainText = crypto.randomBytes(32).toString('hex');
  this.apiKey         = plainText; // Will be hashed in pre-save
  this.apiKeyExpires  = null;
  await this.save();
  return this._plainTextApiKey; // Return the plain-text key to caller
};

module.exports = mongoose.model('AttendanceMachine', machineSchema);

// const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs');
// const crypto = require('crypto');

// const machineSchema = new mongoose.Schema({
//   name: { type: String, required: true, trim: true },
//   serialNumber: { type: String, required: true, unique: true, trim: true },
//   model: String,
//   manufacturer: String,
//   firmwareVersion: String,
  
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

//   // --- Security ---
//   apiKey: { type: String, select: false, required: true },
//   apiKeyExpires: Date,
//   apiKeyLastUsed: Date,
  
//   ipAddress: { type: String, index: true },
//   macAddress: String,
  
//   // --- Configuration ---
//   providerType: { 
//     type: String, 
//     enum: ['generic', 'zkteco', 'hikvision', 'essl', 'bioenable', 'suprema'], 
//     default: 'generic' 
//   },
  
//   connectionProtocol: {
//     type: String,
//     enum: ['tcp', 'http', 'websocket', 'mqtt', 'usb'],
//     default: 'http'
//   },
  
//   port: Number,
//   timeout: { type: Number, default: 5000 },
  
//   // --- Status & Sync ---
//   status: { 
//     type: String, 
//     enum: ['active', 'inactive', 'maintenance', 'offline', 'error'], 
//     default: 'active',
//     index: true 
//   },
  
//   connectionStatus: {
//     type: String,
//     enum: ['online', 'offline', 'connecting', 'disconnected'],
//     default: 'offline'
//   },
  
//   lastSyncAt: Date,
//   lastPingAt: Date,
//   lastError: String,
  
//   // --- Capabilities ---
//   capabilities: {
//     faceRecognition: { type: Boolean, default: false },
//     fingerprint: { type: Boolean, default: true },
//     rfid: { type: Boolean, default: false },
//     temperature: { type: Boolean, default: false },
//     maskDetection: { type: Boolean, default: false }
//   },

//   // --- Statistics ---
//   stats: {
//     totalTransactions: { type: Number, default: 0 },
//     successfulReads: { type: Number, default: 0 },
//     failedReads: { type: Number, default: 0 },
//     lastTransactionAt: Date
//   },

//   // --- Configuration ---
//   config: {
//     timezone: { type: String, default: 'Asia/Kolkata' },
//     syncInterval: { type: Number, default: 5 }, // minutes
//     retryAttempts: { type: Number, default: 3 },
//     autoSync: { type: Boolean, default: true }
//   },

//   // --- Audit ---
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

// }, { timestamps: true });

// // --- INDEXES ---
// machineSchema.index({ organizationId: 1, branchId: 1 });
// machineSchema.index({ status: 1, lastPingAt: 1 });

// // --- MIDDLEWARE ---
// machineSchema.pre('save', async function(next) {
//   // Generate API key if new
//   if (this.isNew && !this.apiKey) {
//     this.apiKey = crypto.randomBytes(32).toString('hex');
//   }
  
//   // Hash API key if modified
//   if (this.isModified('apiKey')) {
//     this.apiKey = await bcrypt.hash(this.apiKey, 10);
//   }
  
//   next();
// });

// // --- METHODS ---
// machineSchema.methods.verifyApiKey = async function(candidateKey) {
//   return await bcrypt.compare(candidateKey, this.apiKey);
// };

// machineSchema.methods.updatePing = function() {
//   this.lastPingAt = new Date();
//   this.connectionStatus = 'online';
//   return this.save();
// };

// module.exports = mongoose.model('AttendanceMachine', machineSchema);
