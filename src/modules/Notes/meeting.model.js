// models/meetingModel.js
// ─────────────────────────────────────────────────────────────────────────────
//  Meeting model — pure scheduling concern.
//
//  Design principles:
//   - Meeting = calendar event with participants, location, and settings
//   - Content (agenda, minutes, action items) lives in linked Note documents
//     (itemType: 'meeting_note') so they get all the Note features for free
//   - GeoJSON location for physical and hybrid meetings
//   - Clean recurrence rule matching iCal RRULE
//   - Per-participant attendance tracking
//   - Voting/polling support (common in business meetings)
//   - Recording and live session metadata
//   - Waiting-room and notification settings
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────
//  SUB-SCHEMAS
// ─────────────────────────────────────────────

/**
 * Participant sub-document.
 * Role covers the full spectrum from organiser to external guest.
 */
const participantSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },

  // For external guests who aren't Users in the system
  externalEmail: String,
  externalName: String,

  role: {
    type: String,
    enum: ['organizer', 'presenter', 'attendee', 'note_taker', 'observer', 'guest'],
    default: 'attendee',
  },

  // Invitation lifecycle
  invitationStatus: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'tentative', 'not_sent'],
    default: 'pending',
  },
  invitedAt: { type: Date, default: Date.now },
  respondedAt: Date,
  responseNote: String,   // "I'll be 5 minutes late"

  // Actual attendance tracking
  attended: { type: Boolean, default: false },
  joinedAt: Date,
  leftAt: Date,
  // Duration actually spent in the meeting (minutes)
  durationMinutes: { type: Number, default: 0 },

  // Whether this person should receive the meeting recording
  receiveRecording: { type: Boolean, default: false },
}, { _id: true });

/**
 * Action item — a concrete next step assigned during a meeting.
 * Separate from the Note model's checklist because action items have
 * owners, due dates, and may become standalone tasks.
 */
const actionItemSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  dueDate: Date,
  status: {
    type: String,
    enum: ['open', 'in_progress', 'done', 'cancelled'],
    default: 'open',
  },
  completedAt: Date,
  // If this item was converted to a full task Note, store the link
  noteId: { type: Schema.Types.ObjectId, ref: 'Note' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
}, { _id: true });

/**
 * Agenda item — structured agenda (like a table of contents for the meeting).
 */
const agendaItemSchema = new Schema({
  order: { type: Number, required: true },
  title: { type: String, required: true, trim: true },
  description: String,
  duration: Number,    // Planned duration in minutes
  presenter: { type: Schema.Types.ObjectId, ref: 'User' },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'skipped'],
    default: 'pending',
  },
  // Actual time spent on this item (filled in during or after meeting)
  actualDuration: Number,
  notes: String,
}, { _id: true });

/**
 * Meeting poll / vote.
 */
const pollSchema = new Schema({
  question: { type: String, required: true },
  options: [{ label: String, votes: [{ type: Schema.Types.ObjectId, ref: 'User' }] }],
  isAnonymous: { type: Boolean, default: false },
  closedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: true });

/**
 * GeoJSON location — identical to the one in noteModel for physical meetings.
 */
const locationSchema = new Schema({
  geoJson: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: undefined }, // [longitude, latitude]
  },
  name: String,
  address: String,
  city: String,
  state: String,
  country: String,
  postalCode: String,
  room: String,   // Conference room name/number
  floor: String,
  building: String,
  directions: String,   // Free-text directions
}, { _id: false });

/**
 * Reminder rule — how and when to send reminders.
 */
const reminderSchema = new Schema({
  channel: { type: String, enum: ['email', 'push', 'sms', 'in_app'], default: 'in_app' },
  minutesBefore: { type: Number, required: true, min: 0 },
  sent: { type: Boolean, default: false },
  sentAt: Date,
}, { _id: true });

/**
 * Recurrence rule — mirrors iCal RRULE.
 */
const recurrenceSchema = new Schema({
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], required: true },
  interval: { type: Number, default: 1, min: 1 },
  daysOfWeek: [{ type: Number, min: 0, max: 6 }],   // 0=Sun
  dayOfMonth: Number,                                 // For monthly
  monthOfYear: Number,                                 // For yearly
  endDate: Date,
  occurrences: { type: Number, min: 1 },               // OR end after N
  exceptions: [Date],                                 // Specific dates to skip
  // ID of the master recurring meeting
  masterId: { type: Schema.Types.ObjectId, ref: 'Meeting' },
  // Sequence number within the recurrence (1, 2, 3…)
  occurrence: Number,
}, { _id: false });

// ─────────────────────────────────────────────
//  MAIN MEETING SCHEMA
// ─────────────────────────────────────────────

const meetingSchema = new Schema({

  // ── Identity ──────────────────────────────────────────────────────────────
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  organizer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },

  // ── Core Fields ───────────────────────────────────────────────────────────
  title: { type: String, required: [true, 'Meeting title is required'], trim: true, maxlength: 500 },
  description: { type: String, trim: true },
  timezone: { type: String, default: 'UTC' },

  // ── Schedule ──────────────────────────────────────────────────────────────
  startTime: { type: Date, required: [true, 'Start time is required'], index: true },
  endTime: { type: Date, required: [true, 'End time is required'], index: true },

  // Buffer time before and after (minutes) — reserve room/link
  bufferBefore: { type: Number, default: 0, min: 0 },
  bufferAfter: { type: Number, default: 0, min: 0 },

  // ── Location ──────────────────────────────────────────────────────────────
  locationType: {
    type: String,
    enum: ['physical', 'virtual', 'hybrid'],
    default: 'virtual',
  },

  // Physical location (GeoJSON + address)
  physicalLocation: locationSchema,

  // Virtual meeting details
  virtual: {
    platform: { type: String, enum: ['zoom', 'teams', 'meet', 'webex', 'custom'], default: 'custom' },
    link: String,
    meetingId: String,
    password: String,
    dialIn: String,  // Phone dial-in number
  },

  // ── Participants ──────────────────────────────────────────────────────────
  participants: [participantSchema],

  // ── Agenda ────────────────────────────────────────────────────────────────
  agendaItems: [agendaItemSchema],

  // ── Minutes & Outcomes ───────────────────────────────────────────────────
  // Free-text meeting minutes (for quick capture; structured content → linked Note)
  minutes: { type: String },

  // Linked Note document (itemType: 'meeting_note') — the "living document"
  // Created automatically when a meeting is created
  linkedNoteId: { type: Schema.Types.ObjectId, ref: 'Note', index: true },

  // Action items agreed during the meeting
  actionItems: [actionItemSchema],

  // Polls / votes
  polls: [pollSchema],

  // ── Status ────────────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled', 'postponed'],
    default: 'scheduled',
    index: true,
  },

  cancelReason: String,
  postponedUntil: Date,

  // ── Recurrence ────────────────────────────────────────────────────────────
  isRecurring: { type: Boolean, default: false },
  recurrence: recurrenceSchema,

  // ── Attachments ───────────────────────────────────────────────────────────
  attachments: [{
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset' },
    url: String,
    fileName: String,
    fileType: String,
    size: Number,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
  }],

  // ── Settings ──────────────────────────────────────────────────────────────
  settings: {
    waitingRoom: { type: Boolean, default: false },
    muteOnEntry: { type: Boolean, default: false },
    allowChat: { type: Boolean, default: true },
    allowRecording: { type: Boolean, default: false },
    autoRecording: { type: Boolean, default: false },
    requireRSVP: { type: Boolean, default: true },
    allowGuests: { type: Boolean, default: false },
    // Whether joining counts as RSVP acceptance
    autoAcceptJoin: { type: Boolean, default: false },
  },

  // ── Recording ─────────────────────────────────────────────────────────────
  recording: {
    enabled: { type: Boolean, default: false },
    url: String,
    duration: Number,    // minutes
    startedAt: Date,
    endedAt: Date,
  },

  // ── Reminders ─────────────────────────────────────────────────────────────
  reminders: [reminderSchema],

  // ── Analytics ─────────────────────────────────────────────────────────────
  analytics: {
    invitedCount: { type: Number, default: 0 },
    acceptedCount: { type: Number, default: 0 },
    attendedCount: { type: Number, default: 0 },
    attendanceRate: Number,   // Percentage
    avgDurationMins: Number,   // Average time each attendee spent
  },

  // ── Tags & Category ───────────────────────────────────────────────────────
  tags: [{ type: String, lowercase: true, trim: true }],
  category: String,

  // ── Soft Delete ───────────────────────────────────────────────────────────
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: Date,
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },

  // ── Audit ─────────────────────────────────────────────────────────────────
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─────────────────────────────────────────────
//  INDEXES
// ─────────────────────────────────────────────

// Calendar view: org → time window → status
meetingSchema.index({ organizationId: 1, startTime: 1, status: 1 });
meetingSchema.index({ organizationId: 1, endTime: 1 });

// My meetings (organiser + participant)
meetingSchema.index({ organizer: 1, startTime: -1 });
meetingSchema.index({ 'participants.user': 1, startTime: -1 });

// Recurring master lookup
meetingSchema.index({ 'recurrence.masterId': 1 }, { sparse: true });

// Physical location geo queries
meetingSchema.index({ 'physicalLocation.geoJson': '2dsphere' }, { sparse: true });

// Text search
meetingSchema.index(
  { title: 'text', description: 'text', 'agendaItems.title': 'text', minutes: 'text' },
  { weights: { title: 10, 'agendaItems.title': 6, description: 3, minutes: 1 }, name: 'MeetingTextSearch' }
);

// TTL: auto-delete soft-deleted meetings after 90 days
meetingSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 7_776_000, sparse: true });

// ─────────────────────────────────────────────
//  VIRTUALS
// ─────────────────────────────────────────────

meetingSchema.virtual('durationMinutes').get(function () {
  if (!this.startTime || !this.endTime) return 0;
  return Math.round((this.endTime - this.startTime) / 60_000);
});

meetingSchema.virtual('isUpcoming').get(function () {
  return this.status === 'scheduled' && this.startTime > new Date();
});

meetingSchema.virtual('isPast').get(function () {
  return this.endTime < new Date();
});

meetingSchema.virtual('isInProgress').get(function () {
  const now = new Date();
  return this.startTime <= now && this.endTime >= now && this.status === 'in_progress';
});

meetingSchema.virtual('acceptanceRate').get(function () {
  if (!this.participants.length) return 0;
  const accepted = this.participants.filter(p => p.invitationStatus === 'accepted').length;
  return Math.round((accepted / this.participants.length) * 100);
});

// ─────────────────────────────────────────────
//  PRE-VALIDATE
// ─────────────────────────────────────────────

meetingSchema.pre('validate', function (next) {
  const errors = [];

  if (this.endTime && this.startTime && this.endTime <= this.startTime) {
    errors.push('endTime must be after startTime');
  }

  if (this.locationType === 'virtual' && !this.virtual?.link) {
    errors.push('A virtual link is required for virtual meetings');
  }

  if (this.locationType === 'physical' && !this.physicalLocation?.address && !this.physicalLocation?.name) {
    errors.push('A physical address or location name is required for in-person meetings');
  }

  if (this.isRecurring && !this.recurrence?.frequency) {
    errors.push('Recurrence frequency is required for recurring meetings');
  }

  if (this.isRecurring && !this.recurrence?.endDate && !this.recurrence?.occurrences) {
    errors.push('Recurring meetings require either an end date or an occurrence count');
  }

  if (errors.length) return next(new Error(errors.join('; ')));
  next();
});

// ─────────────────────────────────────────────
//  PRE-SAVE
// ─────────────────────────────────────────────

meetingSchema.pre('save', function (next) {
  // Ensure GeoJSON type is 'Point'
  if (this.physicalLocation?.geoJson?.coordinates?.length === 2) {
    this.physicalLocation.geoJson.type = 'Point';
  }

  // Update analytics counters from participants array
  if (this.isModified('participants')) {
    const p = this.participants;
    this.analytics.invitedCount = p.filter(x => x.user || x.externalEmail).length;
    this.analytics.acceptedCount = p.filter(x => x.invitationStatus === 'accepted').length;
    this.analytics.attendedCount = p.filter(x => x.attended).length;
    this.analytics.attendanceRate = this.analytics.invitedCount > 0
      ? Math.round((this.analytics.attendedCount / this.analytics.invitedCount) * 100)
      : 0;
  }

  next();
});

// ─────────────────────────────────────────────
//  INSTANCE METHODS
// ─────────────────────────────────────────────

/**
 * Add a participant (idempotent).
 */
meetingSchema.methods.addParticipant = function (userId, role = 'attendee') {
  const exists = this.participants.some(p => p.user?.toString() === userId.toString());
  if (!exists) {
    this.participants.push({ user: userId, role, invitationStatus: 'pending', invitedAt: new Date() });
  }
};

/**
 * Record attendance when a participant joins.
 */
meetingSchema.methods.recordJoin = function (userId) {
  const participant = this.participants.find(p => p.user?.toString() === userId.toString());
  if (participant) {
    participant.attended = true;
    participant.joinedAt = new Date();
    if (participant.invitationStatus === 'pending') {
      participant.invitationStatus = 'accepted';
    }
  }
};

/**
 * Record when a participant leaves.
 */
meetingSchema.methods.recordLeave = function (userId) {
  const participant = this.participants.find(p => p.user?.toString() === userId.toString());
  if (participant && participant.joinedAt) {
    participant.leftAt = new Date();
    participant.durationMinutes = Math.round((participant.leftAt - participant.joinedAt) / 60_000);
  }
};

/**
 * Convert an action item to a full Note (task).
 * Returns the action item so the caller can save the meeting and create the note.
 */
meetingSchema.methods.getActionItemAsNote = function (actionItemId) {
  const item = this.actionItems.id(actionItemId);
  if (!item) throw new Error(`Action item ${actionItemId} not found`);
  return {
    title: item.title,
    content: item.description || '',
    itemType: 'task',
    status: 'open',
    priority: item.priority || 'medium',
    dueDate: item.dueDate,
    meetingId: this._id,
    assignees: item.assignedTo ? [{ user: item.assignedTo, role: 'collaborator', status: 'pending' }] : [],
  };
};

module.exports = mongoose.model('Meeting', meetingSchema);

