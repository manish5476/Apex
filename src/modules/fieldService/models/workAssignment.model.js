// models/workAssignment.model.js
// ─────────────────────────────────────────────────────────────────────────────
//  WorkAssignment — Field Service domain model.
//
//  Design principles:
//   - 14-state lifecycle aligned to Dynamics 365 Field Service
//   - Full SLA triple-deadline tracking (response / arrival / completion)
//   - Recurrence rules compatible with iCal RRULE
//   - Skills stored as ObjectId refs for automatic technician matching
//   - AI-ready fields on the 'ai' sub-document (never null, never removed)
//   - Inventory items reserved at assignment creation, consumed on completion
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────
//  ENUMS
// ─────────────────────────────────────────────

const STATUS_STATES = [
  'draft',
  'scheduled',
  'assigned',
  'accepted',
  'travelling',
  'arrived',
  'working',
  'paused',
  'waiting_customer',
  'waiting_parts',
  'testing',
  'completed',
  'verified',
  'closed',
  'cancelled',
];

// ─────────────────────────────────────────────
//  SUB-SCHEMAS
// ─────────────────────────────────────────────

const slaSchema = new Schema({
  responseDeadline:   Date,
  arrivalDeadline:    Date,
  completionDeadline: Date,
  actualArrival:      Date,
  actualCompletion:   Date,
  breached: { type: Boolean, default: false },
  breachReason: String,
  breachType: { type: String, enum: ['response', 'arrival', 'completion'] },
}, { _id: false });

const recurrenceRuleSchema = new Schema({
  frequency:  { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] },
  interval:   { type: Number, min: 1, default: 1 },
  daysOfWeek: { type: [Number], default: undefined }, // 0=Sun … 6=Sat
  endDate:    Date,
  maxOccurrences: { type: Number, min: 1 },
}, { _id: false });

const inventoryItemSchema = new Schema({
  productId:  { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  qty:        { type: Number, min: 1, required: true },
  reservedAt: { type: Date, default: Date.now },
  consumed:   { type: Boolean, default: false },
}, { _id: true });

/**
 * AI-ready sub-document.
 * All fields are optional and filled asynchronously (by the technician, by
 * a background job, or by a future AI prediction service).
 * Schema is fixed at v1 — add new fields here rather than at the top level.
 */
const aiSchema = new Schema({
  estimatedDuration:    Number,  // predicted duration in minutes (model output)
  actualDuration:       Number,  // filled when assignment is closed
  completionRate:       Number,  // 0–100 percentage
  firstVisitResolution: Boolean,
  customerRating:       { type: Number, min: 1, max: 5 },
  delayReason:          String,
  travelTime:           Number,  // GPS-measured actual travel minutes
  energyConsumption:    Number,  // kWh (for eco / sustainability reporting)
}, { _id: false });

// ─────────────────────────────────────────────
//  MAIN SCHEMA
// ─────────────────────────────────────────────

const workAssignmentSchema = new Schema({

  // ── Core ──────────────────────────────────
  title:         { type: String, required: true, trim: true },
  description:   { type: String, trim: true },
  internalNotes: { type: String, trim: true },

  status: {
    type: String,
    enum: STATUS_STATES,
    default: 'draft',
    index: true,
  },

  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true,
  },

  // ── Parties ───────────────────────────────
  assignedTo:     [{ type: Schema.Types.ObjectId, ref: 'User' }],
  customerId:     { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  branchId:       { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

  // ── Skills (ObjectId refs, not free-text strings) ────────────────────────
  // Enables automatic technician matching against employee skill profiles.
  requiredSkills: [{ type: Schema.Types.ObjectId, ref: 'Skill' }],

  // ── Location ──────────────────────────────
  location: {
    address: String,
    lat:     Number,
    lng:     Number,
  },
  travelTimeEstimateMins: { type: Number, min: 0 },

  // ── Schedule ──────────────────────────────
  scheduledAt:           { type: Date, index: true },
  estimatedDurationMins: { type: Number, min: 1 },

  // ── SLA ───────────────────────────────────
  sla: { type: slaSchema, default: {} },

  // ── Inventory ─────────────────────────────
  inventoryItems: [inventoryItemSchema],

  // ── Recurrence ────────────────────────────
  recurrenceRule:   recurrenceRuleSchema,
  parentAssignment: { type: Schema.Types.ObjectId, ref: 'WorkAssignment' },
  seriesId:         { type: Schema.Types.ObjectId, index: true },
  nextOccurrence:   Date,

  // ── AI-ready ──────────────────────────────
  ai: { type: aiSchema, default: {} },

  // ── Audit ─────────────────────────────────
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },

}, {
  timestamps: true,  // createdAt, updatedAt
  toJSON:     { virtuals: true },
  toObject:   { virtuals: true },
});

// ─────────────────────────────────────────────
//  INDEXES
// ─────────────────────────────────────────────

workAssignmentSchema.index({ organizationId: 1, scheduledAt: 1 });
workAssignmentSchema.index({ organizationId: 1, status: 1 });
workAssignmentSchema.index({ organizationId: 1, assignedTo: 1, scheduledAt: 1 });
workAssignmentSchema.index({ organizationId: 1, seriesId: 1 });
workAssignmentSchema.index({ 'sla.completionDeadline': 1, 'sla.breached': 1 }); // SLA breach cron

// ─────────────────────────────────────────────
//  PRE-SAVE: SLA breach detection
// ─────────────────────────────────────────────

workAssignmentSchema.pre('save', function (next) {
  // Automatically mark SLA as breached when closed without meeting deadline.
  if (this.isModified('status') && this.status === 'closed') {
    const now = this.ai?.actualCompletion || new Date();

    if (this.sla?.completionDeadline && now > this.sla.completionDeadline && !this.sla.breached) {
      this.sla.breached = true;
      if (!this.sla.breachType) this.sla.breachType = 'completion';
    }
  }
  next();
});

// ─────────────────────────────────────────────
//  STATICS
// ─────────────────────────────────────────────

/**
 * Find assignments that are overdue for SLA breach detection.
 * Called by a cron job every 5 minutes.
 */
workAssignmentSchema.statics.findSlaAtRisk = function (orgId) {
  const now = new Date();
  return this.find({
    organizationId: orgId,
    'sla.breached': false,
    status: { $nin: ['completed', 'verified', 'closed', 'cancelled'] },
    $or: [
      { 'sla.completionDeadline': { $lt: now } },
      { 'sla.arrivalDeadline':    { $lt: now } },
    ],
  }).select('_id title assignedTo sla status');
};

const WorkAssignment = mongoose.model('WorkAssignment', workAssignmentSchema);
module.exports = WorkAssignment;
