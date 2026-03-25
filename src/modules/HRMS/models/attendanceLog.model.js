const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['machine', 'web', 'mobile', 'admin_manual', 'api', 'biometric', 'rfid'],
    required: true,
  },
  machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceMachine' },

  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User',         required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',       index: true },

  timestamp:       { type: Date, required: true, index: true },
  serverTimestamp: { type: Date, default: Date.now },
  timezone:        String,

  type: {
    type: String,
    enum: ['in', 'out', 'break_start', 'break_end', 'remote_in', 'remote_out', 'overtime_in', 'overtime_out'],
    required: true,
  },

  // --- Device Info ---
  ipAddress:  String,
  userAgent:  String,
  deviceId:   String,
  deviceName: String,

  // --- Biometric Data ---
  biometricData: {
    templateId: String,
    confidence: { type: Number, min: 0, max: 100 },
    method: { type: String, enum: ['fingerprint', 'face', 'iris', 'palm'] },
  },

  // FIX BUG-AL-02 [HIGH] — Restructured location as a proper GeoJSON subdocument.
  // Original had `coordinates: { type: [Number], index: '2dsphere' }` which indexed only
  // the array — MongoDB requires the 2dsphere index on the full GeoJSON parent object.
  // `$geoNear` and `$geoWithin` queries silently failed with the old structure.
  location: {
    // GeoJSON Point (for MongoDB 2dsphere queries)
    geoJson: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number] }, // [longitude, latitude]
    },
    accuracy:  Number,  // metres
    altitude:  Number,
    address:   String,
    geofenceStatus: { type: String, enum: ['inside', 'outside', 'disabled'] },
    geofenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GeoFence' },
  },

  // --- Verification & Processing ---
  isVerified:  { type: Boolean, default: false },
  verifiedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt:  Date,

  processingStatus: {
    type: String,
    enum: ['pending', 'processed', 'flagged', 'rejected', 'corrected', 'duplicate'],
    default: 'pending',
  },

  // FIX BUG-AL-01 [HIGH] — Added dailyAttendanceId field so markAsProcessed can
  // link this log back to the parent AttendanceDaily record. Original accepted
  // dailyRecordId as a parameter but discarded it entirely — logs were never linked.
  dailyAttendanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceDaily',
    default: null,
    index: true,
  },

  // --- Media ---
  imageUrl:           String,
  annotatedImageUrl:  String,

  // --- Correction Tracking ---
  correctionRef:  { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceRequest' },
  isCorrection:   { type: Boolean, default: false },
  originalLogId:  { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' },

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes:     String,

}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────

// Primary: user punch history
attendanceLogSchema.index({ user: 1, timestamp: -1 });

// FIX BUG-AL-03 [MEDIUM] — Added org-scoped user+timestamp index for manager queries
attendanceLogSchema.index({ organizationId: 1, user: 1, timestamp: -1 });

// Org-level log feed with source filter
attendanceLogSchema.index({ organizationId: 1, timestamp: -1, source: 1 });

// Machine sync: pull logs per machine since last sync
attendanceLogSchema.index({ machineId: 1, timestamp: -1 });

// FIX BUG-AL-04 [MEDIUM] — Added organizationId prefix to processing status index.
// Original `{ processingStatus, createdAt }` scanned ALL orgs — a background cron
// processing "pending" logs would do a full collection scan in multi-tenant systems.
attendanceLogSchema.index({ organizationId: 1, processingStatus: 1, createdAt: 1 });

// Biometric deduplication
attendanceLogSchema.index({ 'biometricData.templateId': 1 });

// FIX BUG-AL-02 — 2dsphere index on the proper GeoJSON parent field
attendanceLogSchema.index({ 'location.geoJson': '2dsphere' });

// ─────────────────────────────────────────────
//  Methods
// ─────────────────────────────────────────────

/**
 * FIX BUG-AL-01 [HIGH] — markAsProcessed now actually uses the dailyRecordId argument.
 * Original accepted dailyRecordId but discarded it — no link was ever created between
 * the log and its parent AttendanceDaily record, making the logs[] array in AttendanceDaily
 * always empty unless manually populated from the controller.
 *
 * @param {ObjectId} dailyRecordId - The AttendanceDaily._id this log belongs to
 */
attendanceLogSchema.methods.markAsProcessed = async function (dailyRecordId) {
  this.processingStatus    = 'processed';
  this.isVerified          = true;
  this.dailyAttendanceId   = dailyRecordId; // FIX: now persisted
  await this.save();

  // Also push this log's _id into the parent AttendanceDaily.logs array
  if (dailyRecordId) {
    const AttendanceDaily = mongoose.model('AttendanceDaily');
    await AttendanceDaily.findByIdAndUpdate(dailyRecordId, {
      $addToSet: { logs: this._id }, // $addToSet prevents duplicates on retry
    });
  }
};

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);


// const mongoose = require('mongoose');

// const attendanceLogSchema = new mongoose.Schema({
//   source: { 
//     type: String, 
//     enum: ['machine', 'web', 'mobile', 'admin_manual', 'api', 'biometric', 'rfid'], 
//     required: true 
//   },
//   machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceMachine' },

//   user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

//   timestamp: { type: Date, required: true, index: true },
//   serverTimestamp: { type: Date, default: Date.now },
//   timezone: String,

//   type: { 
//     type: String, 
//     enum: ['in', 'out', 'break_start', 'break_end', 'remote_in', 'remote_out', 'overtime_in', 'overtime_out'], 
//     required: true 
//   },

//   // --- Device Info ---
//   ipAddress: String,
//   userAgent: String,
//   deviceId: String,
//   deviceName: String,
  
//   // --- Biometric Data ---
//   biometricData: {
//     templateId: String,
//     confidence: { type: Number, min: 0, max: 100 },
//     method: { type: String, enum: ['fingerprint', 'face', 'iris', 'palm'] }
//   },

//   // --- Location Data ---
//   location: {
//     type: { type: String, default: 'Point' },
//     coordinates: { type: [Number], index: '2dsphere' }, // [longitude, latitude]
//     accuracy: Number,
//     altitude: Number,
//     address: String,
//     geofenceStatus: { type: String, enum: ['inside', 'outside', 'disabled'] },
//     geofenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GeoFence' }
//   },

//   // --- Verification & Processing ---
//   isVerified: { type: Boolean, default: false },
//   verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   verifiedAt: Date,
  
//   processingStatus: { 
//     type: String, 
//     enum: ['pending', 'processed', 'flagged', 'rejected', 'corrected', 'duplicate'], 
//     default: 'pending' 
//   },
  
//   // --- Media ---
//   imageUrl: String,
//   annotatedImageUrl: String, // For face recognition

//   // --- Correction Tracking ---
//   correctionRef: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceRequest' },
//   isCorrection: { type: Boolean, default: false },
//   originalLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' },

//   // --- Audit ---
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   notes: String

// }, { 
//   timestamps: true,
//   toJSON: { virtuals: true }
// });

// // --- INDEXES ---
// attendanceLogSchema.index({ user: 1, timestamp: -1 });
// attendanceLogSchema.index({ organizationId: 1, timestamp: -1, source: 1 });
// attendanceLogSchema.index({ machineId: 1, timestamp: -1 });
// attendanceLogSchema.index({ processingStatus: 1, createdAt: 1 });
// attendanceLogSchema.index({ 'biometricData.templateId': 1 });

// // --- METHODS ---
// attendanceLogSchema.methods.markAsProcessed = async function(dailyRecordId) {
//   this.processingStatus = 'processed';
//   this.isVerified = true;
//   await this.save();
// };

// module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);// const mongoose = require('mongoose');
