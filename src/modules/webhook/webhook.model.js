const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;

const ENCRYPTION_KEY = process.env.WEBHOOK_SECRET_KEY; // Must be exactly 32 chars
const IV_LENGTH = 16;

function encryptSecret(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc', 
    Buffer.from(ENCRYPTION_KEY), 
    iv
  );
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(text) {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc', 
    Buffer.from(ENCRYPTION_KEY), 
    iv
  );
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
}

const CircuitBreakerSchema = new Schema({
  state: { 
    type: String, 
    enum: ['closed', 'open', 'half-open'], 
    default: 'closed' 
  },
  failureCount:  { type: Number, default: 0 },
  successCount:  { type: Number, default: 0 }, // Counts successes in half-open
  openedAt:      Date,
  nextRetryAt:   Date,
}, { _id: false });

const WebhookSchema = new Schema({
  organizationId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true, 
    index: true 
  },
  name:   { type: String, required: true, trim: true },
  url:    { type: String, required: true, trim: true },

  // Stored AES-256 encrypted. Never stored plaintext.
  _encryptedSecret: { type: String, select: false },

  events: [{
    type: String,
    enum: [
      'invoice.created', 
      'invoice.updated',
      'payment.received', 
      'stock.low', 
      'customer.created',
      'customer.updated'
    ]
  }],

  // Stats
  totalDeliveries:     { type: Number, default: 0 },
  successfulDeliveries:{ type: Number, default: 0 },
  failedDeliveries:    { type: Number, default: 0 },
  lastDeliveryAt:      Date,
  lastDeliveryStatus:  { type: String, enum: ['success', 'failed'] },

  circuitBreaker: { type: CircuitBreakerSchema, default: () => ({}) },

  isActive:  { type: Boolean, default: true, index: true },
}, { timestamps: true });

// ── Indexes ─────────────────────────────────────────
WebhookSchema.index({ organizationId: 1, isActive: 1 });
WebhookSchema.index({ organizationId: 1, events: 1 }); // Fast event lookup

// ── Secret Handling ─────────────────────────────────
// Set plain secret → it gets encrypted before save
WebhookSchema.virtual('secret').set(function(plainSecret) {
  this._encryptedSecret = encryptSecret(plainSecret);
});

// Expose decrypted secret for signing only (never sent to client)
WebhookSchema.methods.getSecret = function() {
  if (!this._encryptedSecret) return null;
  return decryptSecret(this._encryptedSecret);
};

// ── Circuit Breaker Logic ────────────────────────────
const FAILURE_THRESHOLD  = 5;  // Open after 5 consecutive failures
const SUCCESS_THRESHOLD  = 2;  // Close after 2 successes in half-open
const OPEN_DURATION_MS   = 60 * 60 * 1000; // Stay open for 1 hour

WebhookSchema.methods.canDeliver = function() {
  const cb = this.circuitBreaker;
  if (cb.state === 'closed') return true;

  if (cb.state === 'open') {
    // Check if it's time to try again
    if (cb.nextRetryAt && cb.nextRetryAt <= new Date()) {
      // Transition to half-open to allow one test request
      this.circuitBreaker.state = 'half-open';
      this.circuitBreaker.successCount = 0;
      return true;
    }
    return false; // Still open — skip delivery entirely
  }

  return true; // half-open: allow through
};

WebhookSchema.methods.recordSuccess = async function() {
  const cb = this.circuitBreaker;

  if (cb.state === 'half-open') {
    cb.successCount += 1;
    if (cb.successCount >= SUCCESS_THRESHOLD) {
      // Fully recovered — close the circuit
      cb.state = 'closed';
      cb.failureCount = 0;
      cb.successCount = 0;
      cb.openedAt = undefined;
      cb.nextRetryAt = undefined;
    }
  } else {
    cb.failureCount = 0; // Reset on any success in closed state
  }

  this.totalDeliveries += 1;
  this.successfulDeliveries += 1;
  this.lastDeliveryAt = new Date();
  this.lastDeliveryStatus = 'success';
  await this.save();
};

WebhookSchema.methods.recordFailure = async function() {
  const cb = this.circuitBreaker;
  cb.failureCount += 1;

  if (cb.state === 'half-open') {
    // Failed during test — reopen immediately
    cb.state = 'open';
    cb.openedAt = new Date();
    cb.nextRetryAt = new Date(Date.now() + OPEN_DURATION_MS);
    cb.successCount = 0;
  } else if (cb.failureCount >= FAILURE_THRESHOLD) {
    // Too many failures — open the circuit
    cb.state = 'open';
    cb.openedAt = new Date();
    cb.nextRetryAt = new Date(Date.now() + OPEN_DURATION_MS);
  }

  this.totalDeliveries += 1;
  this.failedDeliveries += 1;
  this.lastDeliveryAt = new Date();
  this.lastDeliveryStatus = 'failed';
  await this.save();
};

module.exports = mongoose.model('Webhook', WebhookSchema);