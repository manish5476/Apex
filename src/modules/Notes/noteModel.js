// models/noteModel.js
// ─────────────────────────────────────────────────────────────────────────────
//  Unified Work-Item model: handles Notes, Tasks, Ideas, Journals, and Projects.
//  Meetings are a separate scheduling concern (see meetingModel.js).
//
//  Design principles:
//   - Single collection, strong type discrimination via `itemType`
//   - Comments and activity logs live in separate collections (unbounded arrays
//     inside a document risk the 16 MB BSON limit)
//   - Full GeoJSON location support
//   - First-class task assignment workflow
//   - Time tracking, checklists with per-item assignees, watchers, custom fields
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────
//  CONSTANTS (export so controllers can use them)
// ─────────────────────────────────────────────

const ITEM_TYPES    = ['note', 'task', 'idea', 'journal', 'project', 'meeting_note'];
const STATUSES      = ['draft', 'open', 'in_progress', 'in_review', 'done', 'archived', 'cancelled', 'active', 'completed', 'deferred'];
const PRIORITIES    = ['none', 'low', 'medium', 'high', 'urgent'];
const VISIBILITIES  = ['private', 'assignees', 'team', 'department', 'organization'];

// Numeric sort key so `sort({ priorityOrder: -1 })` works correctly
const PRIORITY_ORDER = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };

// Assignment states (per assignee)
const ASSIGNMENT_STATUSES = ['pending', 'accepted', 'declined', 'in_progress', 'done', 'verified'];

// ─────────────────────────────────────────────
//  SUB-SCHEMAS
// ─────────────────────────────────────────────

/**
 * Assignee sub-document.
 * Each assignee has their own workflow state so the organiser can track
 * individual progress without a separate Task model.
 */
const assigneeSchema = new Schema({
  user:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
  assignedAt:  { type: Date, default: Date.now },
  role:        { type: String, enum: ['owner', 'collaborator', 'reviewer', 'observer'], default: 'collaborator' },
  status:      { type: String, enum: ASSIGNMENT_STATUSES, default: 'pending' },
  acceptedAt:  Date,
  completedAt: Date,
  // Estimated and logged hours per assignee (supports per-person billing/reporting)
  estimatedHours: { type: Number, min: 0, default: 0 },
  loggedHours:    { type: Number, min: 0, default: 0 },
  notes:       String,  // Assignee's own notes on their work
}, { _id: true });

/**
 * Checklist item — like GitHub / Jira checkbox list.
 * Each item can have its own assignee, due date, and priority.
 */
const checklistItemSchema = new Schema({
  title:      { type: String, required: true, trim: true },
  completed:  { type: Boolean, default: false },
  completedAt:Date,
  completedBy:{ type: Schema.Types.ObjectId, ref: 'User' },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  dueDate:    Date,
  order:      { type: Number, default: 0 },  // For drag-and-drop reordering
}, { _id: true });

/**
 * GeoJSON location — supports both a precise point and a human-readable address.
 * Enables geospatial queries: "show all tasks near this site".
 */
const locationSchema = new Schema({
  // GeoJSON Point for $near / $geoWithin queries
  geoJson: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: undefined }, // [longitude, latitude]
  },
  // Human-readable fields
  name:       String,   // e.g. "Client HQ", "Site A"
  address:    String,
  city:       String,
  state:      String,
  country:    String,
  postalCode: String,
  // Accuracy of the recorded position (metres) — useful for mobile punches
  accuracy:   Number,
}, { _id: false });

/**
 * Time-log entry — individual time tracking record.
 * Kept inside the document (bounded: real-world max ~100 entries per item).
 */
const timeLogSchema = new Schema({
  user:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  startTime: { type: Date, required: true },
  endTime:   Date,
  hours:     { type: Number, min: 0 },   // Can be set manually instead of computed
  note:      String,
  loggedAt:  { type: Date, default: Date.now },
}, { _id: true });

/**
 * Recurrence rule — mirrors iCal RRULE for frontend calendar compatibility.
 */
const recurrenceSchema = new Schema({
  enabled:    { type: Boolean, default: false },
  frequency:  { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] },
  interval:   { type: Number, default: 1, min: 1 },  // every N frequency units
  daysOfWeek: [{ type: Number, min: 0, max: 6 }],    // 0=Sun … 6=Sat
  endDate:    Date,
  occurrences:{ type: Number, min: 1 },               // OR end after N occurrences
  // ID of the parent recurring item (populated on generated instances)
  parentId:   { type: Schema.Types.ObjectId, ref: 'Note' },
}, { _id: false });

/**
 * Custom field — key-value pairs that let teams extend the schema without
 * a DB migration (e.g. "Sprint", "Story Points", "Client Name").
 */
const customFieldSchema = new Schema({
  key:       { type: String, required: true, trim: true },
  value:     Schema.Types.Mixed,
  fieldType: { type: String, enum: ['text', 'number', 'date', 'boolean', 'url', 'select'], default: 'text' },
}, { _id: false });

/**
 * Label — coloured tag that belongs to the organisation (like GitHub labels).
 */
const labelSchema = new Schema({
  name:  { type: String, required: true, trim: true },
  color: { type: String, default: '#6b7280' },  // Hex colour
}, { _id: true });

/**
 * Attachment record — stores metadata; actual file lives in cloud storage.
 */
const attachmentSchema = new Schema({
  assetId:    { type: Schema.Types.ObjectId, ref: 'Asset' }, // Link to master asset
  url:        { type: String, required: true },
  publicId:   String,
  fileName:   { type: String, required: true },
  fileType:   String,   // MIME type
  size:       Number,   // bytes
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

// ─────────────────────────────────────────────
//  MAIN NOTE SCHEMA
// ─────────────────────────────────────────────

const noteSchema = new Schema({

  // ── Identity ──────────────────────────────────────────────────────────────
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  owner:          { type: Schema.Types.ObjectId, ref: 'User',         required: true, index: true },

  // ── Type & Classification ─────────────────────────────────────────────────
  itemType: {
    type:    String,
    enum:    ITEM_TYPES,
    default: 'note',
    index:   true,
  },

  // ── Core Content ──────────────────────────────────────────────────────────
  title:   { type: String, required: [true, 'Title is required'], trim: true, maxlength: 500 },
  content: { type: String, default: '' },    // Rich text / Markdown — NOT required
  summary: { type: String, trim: true, maxlength: 1000 },

  // ── Status & Priority ─────────────────────────────────────────────────────
  status: { type: String, enum: STATUSES, default: 'open', index: true },

  priority: { type: String, enum: PRIORITIES, default: 'none', index: true },

  // Numeric sort key derived from priority (set in pre-save).
  // Enables `sort({ priorityOrder: -1 })` without a complex $switch in aggregation.
  priorityOrder: { type: Number, default: 0, index: true },

  // ── Time Management ───────────────────────────────────────────────────────
  startDate:   { type: Date, index: true },
  dueDate:     { type: Date, index: true },
  completedAt: Date,
  archivedAt:  Date,

  // Total estimated hours (rolled up from assignees or set manually)
  estimatedHours: { type: Number, min: 0, default: 0 },

  // Total logged hours (rolled up from timeLogs or set manually)
  loggedHours: { type: Number, min: 0, default: 0 },

  timeLogs: [timeLogSchema],

  recurrence: recurrenceSchema,

  // ── Assignment ────────────────────────────────────────────────────────────
  assignees: [assigneeSchema],

  // Watchers receive notifications but have no action items
  watchers: [{ type: Schema.Types.ObjectId, ref: 'User' }],

  // ── Categorisation ────────────────────────────────────────────────────────
  category: { type: String, trim: true, index: true },
  tags:      [{ type: String, lowercase: true, trim: true }],
  labels:    [labelSchema],

  // ── Checklist ─────────────────────────────────────────────────────────────
  checklist: [checklistItemSchema],
  // Cached progress percentage (0–100) derived from checklist in pre-save
  progress: { type: Number, min: 0, max: 100, default: 0 },

  // ── Location ─────────────────────────────────────────────────────────────
  // Full GeoJSON + human-readable address.
  // Example use: "Task must be completed at client site" with coords.
  location: locationSchema,

  // ── Visibility & Sharing ─────────────────────────────────────────────────
  visibility: { type: String, enum: VISIBILITIES, default: 'private', index: true },

  // Explicit user-level share (overrides visibility for specific users)
  sharedWith: [{
    user:       { type: Schema.Types.ObjectId, ref: 'User' },
    permission: { type: String, enum: ['view', 'comment', 'edit'], default: 'view' },
    sharedAt:   { type: Date, default: Date.now },
    sharedBy:   { type: Schema.Types.ObjectId, ref: 'User' },
  }],

  // Department-level visibility (when visibility = 'department')
  visibleToDepartments: [{ type: Schema.Types.ObjectId, ref: 'Department' }],

  // ── Relationships ─────────────────────────────────────────────────────────
  // Parent item (for sub-tasks / nested notes)
  parentId:     { type: Schema.Types.ObjectId, ref: 'Note', index: true },
  // Bidirectional links to related notes
  relatedNotes: [{ type: Schema.Types.ObjectId, ref: 'Note' }],
  // Project this item belongs to
  projectId:    { type: Schema.Types.ObjectId, ref: 'Project', index: true },
  // When itemType = 'meeting_note', link to the Meeting document
  meetingId:    { type: Schema.Types.ObjectId, ref: 'Meeting' },

  // ── Attachments ───────────────────────────────────────────────────────────
  attachments: [attachmentSchema],

  // ── Metadata ──────────────────────────────────────────────────────────────
  isPinned:   { type: Boolean, default: false, index: true },
  isTemplate: { type: Boolean, default: false },
  templateId: { type: Schema.Types.ObjectId, ref: 'Note' },

  // Custom fields (team-defined schema extensions)
  customFields: [customFieldSchema],

  // External integration IDs (e.g. Jira ticket, GitHub issue)
  externalRefs: [{
    service: String,   // e.g. 'jira', 'github', 'trello'
    refId:   String,   // External ID
    url:     String,   // Direct link
  }],

  // ── Stats (denormalised for performance) ──────────────────────────────────
  commentCount:  { type: Number, default: 0 },
  viewCount:     { type: Number, default: 0 },
  lastViewedAt:  Date,
  lastViewedBy:  { type: Schema.Types.ObjectId, ref: 'User' },

  // ── Soft Delete ───────────────────────────────────────────────────────────
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: Date,
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },

  // ── Audit ─────────────────────────────────────────────────────────────────
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },

}, {
  timestamps: true,
  toJSON:     { virtuals: true },
  toObject:   { virtuals: true },
});

// ─────────────────────────────────────────────
//  INDEXES
// ─────────────────────────────────────────────

// Primary list query: org → type → status (most common filter combination)
noteSchema.index({ organizationId: 1, itemType: 1, status: 1, priorityOrder: -1 });

// Due-date based queries (overdue dashboard, calendar)
noteSchema.index({ organizationId: 1, dueDate: 1, status: 1 });

// Assignee inbox: "show me all tasks assigned to user X"
noteSchema.index({ organizationId: 1, 'assignees.user': 1, 'assignees.status': 1 });

// Watcher feed
noteSchema.index({ organizationId: 1, watchers: 1 });

// Shared-with queries
noteSchema.index({ organizationId: 1, 'sharedWith.user': 1 });

// Project board
noteSchema.index({ organizationId: 1, projectId: 1, status: 1, priorityOrder: -1 });

// Parent→children (sub-tasks)
noteSchema.index({ organizationId: 1, parentId: 1 });

// Meeting note lookup
noteSchema.index({ meetingId: 1 }, { sparse: true });

// Pinned notes (sidebar widget)
noteSchema.index({ organizationId: 1, owner: 1, isPinned: 1 });

// Geospatial: find notes near a coordinate
noteSchema.index({ 'location.geoJson': '2dsphere' }, { sparse: true });

// Full-text search across title, content, summary
noteSchema.index(
  { title: 'text', content: 'text', summary: 'text' },
  { weights: { title: 10, summary: 5, content: 2 }, name: 'NoteTextSearch' }
);

// Recurrence parent tracking
noteSchema.index({ 'recurrence.parentId': 1 }, { sparse: true });

// Tag filtering
noteSchema.index({ organizationId: 1, tags: 1 });

// Recent items (global activity feed)
noteSchema.index({ organizationId: 1, updatedAt: -1 });

// ─────────────────────────────────────────────
//  VIRTUALS
// ─────────────────────────────────────────────

noteSchema.virtual('isOverdue').get(function () {
  if (!this.dueDate) return false;
  if (['done', 'archived', 'cancelled'].includes(this.status)) return false;
  return this.dueDate < new Date();
});

noteSchema.virtual('timeRemaining').get(function () {
  if (!this.dueDate || ['done', 'archived', 'cancelled'].includes(this.status)) return null;
  return Math.max(0, this.dueDate.getTime() - Date.now()); // ms
});

noteSchema.virtual('checklistProgress').get(function () {
  if (!this.checklist || this.checklist.length === 0) return null;
  const done  = this.checklist.filter(i => i.completed).length;
  const total = this.checklist.length;
  return { done, total, percentage: Math.round((done / total) * 100) };
});

noteSchema.virtual('totalLoggedHours').get(function () {
  if (!this.timeLogs || this.timeLogs.length === 0) return this.loggedHours;
  return this.timeLogs.reduce((sum, log) => {
    if (log.hours) return sum + log.hours;
    if (log.startTime && log.endTime) {
      return sum + (log.endTime - log.startTime) / 3_600_000;
    }
    return sum;
  }, 0);
});

// Virtual for populated sub-tasks (via parentId)
noteSchema.virtual('subTasks', {
  ref:          'Note',
  localField:   '_id',
  foreignField: 'parentId',
  match:        { isDeleted: false },
});

// Virtual for comments count (actual documents in NoteComment collection)
noteSchema.virtual('comments', {
  ref:         'NoteComment',
  localField:  '_id',
  foreignField:'noteId',
});

// ─────────────────────────────────────────────
//  PRE-VALIDATE
// ─────────────────────────────────────────────

noteSchema.pre('validate', function (next) {
  // Guard: dueDate must be after startDate
  if (this.startDate && this.dueDate && this.dueDate < this.startDate) {
    return next(new Error('dueDate must be on or after startDate'));
  }

  // Guard: circular parent reference
  if (this.parentId && this.parentId.toString() === this._id.toString()) {
    return next(new Error('A note cannot be its own parent'));
  }

  // Guard: GeoJSON coordinates must be [longitude, latitude] (2 elements)
  if (this.location?.geoJson?.coordinates && this.location.geoJson.coordinates.length !== 2) {
    return next(new Error('location.geoJson.coordinates must be [longitude, latitude]'));
  }

  next();
});

// ─────────────────────────────────────────────
//  PRE-SAVE
// ─────────────────────────────────────────────

noteSchema.pre('save', function (next) {
  // Sync priorityOrder from priority string for efficient sorting
  this.priorityOrder = PRIORITY_ORDER[this.priority] ?? 0;

  // Auto-set completedAt when status transitions to 'done'
  if (this.isModified('status') && this.status === 'done' && !this.completedAt) {
    this.completedAt = new Date();
  }

  // Auto-set archivedAt
  if (this.isModified('status') && this.status === 'archived' && !this.archivedAt) {
    this.archivedAt = new Date();
  }

  // Auto-generate summary from content if not manually set
  if (this.isModified('content') && this.content && !this.summary) {
    this.summary = this.content.replace(/[#*`>\-]/g, '').substring(0, 200).trim();
    if (this.content.length > 200) this.summary += '…';
  }

  // Recompute checklist progress
  if (this.isModified('checklist') && this.checklist.length > 0) {
    const done  = this.checklist.filter(i => i.completed).length;
    this.progress = Math.round((done / this.checklist.length) * 100);
  } else if (this.checklist.length === 0) {
    this.progress = 0;
  }

  // Sync loggedHours from timeLogs
  if (this.isModified('timeLogs')) {
    this.loggedHours = this.timeLogs.reduce((sum, log) => {
      if (log.hours) return sum + log.hours;
      if (log.startTime && log.endTime) {
        return sum + (log.endTime - log.startTime) / 3_600_000;
      }
      return sum;
    }, 0);
    this.loggedHours = parseFloat(this.loggedHours.toFixed(2));
  }

  // Ensure GeoJSON type is always 'Point' when coordinates are provided
  if (this.location?.geoJson?.coordinates?.length === 2) {
    this.location.geoJson.type = 'Point';
  }

  next();
});

// ─────────────────────────────────────────────
//  INSTANCE METHODS
// ─────────────────────────────────────────────

/**
 * Assign a user to this note/task.
 * Idempotent: calling twice with the same userId has no effect.
 */
noteSchema.methods.assignUser = function (userId, assignedBy, role = 'collaborator') {
  const already = this.assignees.some(a => a.user.toString() === userId.toString());
  if (!already) {
    this.assignees.push({ user: userId, assignedBy, role, status: 'pending' });
    // Also add to watchers if not already watching
    if (!this.watchers.some(w => w.toString() === userId.toString())) {
      this.watchers.push(userId);
    }
  }
};

/**
 * Update an assignee's workflow status.
 */
noteSchema.methods.updateAssigneeStatus = function (userId, newStatus) {
  const assignee = this.assignees.find(a => a.user.toString() === userId.toString());
  if (!assignee) throw new Error(`User ${userId} is not an assignee`);
  if (!ASSIGNMENT_STATUSES.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);
  assignee.status = newStatus;
  if (newStatus === 'accepted')   assignee.acceptedAt  = new Date();
  if (newStatus === 'done')       assignee.completedAt = new Date();
};

/**
 * Add or update a time log entry.
 * If logId is provided, updates existing; otherwise creates new.
 */
noteSchema.methods.logTime = function (userId, hours, note = '', startTime = null, endTime = null) {
  const entry = {
    user:      userId,
    startTime: startTime || new Date(),
    endTime:   endTime   || null,
    hours:     parseFloat(hours.toFixed(2)),
    note,
    loggedAt:  new Date(),
  };
  this.timeLogs.push(entry);
  // Sync total (will also run in pre-save, but useful for in-memory access)
  this.loggedHours = parseFloat((this.loggedHours + entry.hours).toFixed(2));
};

/**
 * Toggle a checklist item and recompute progress.
 */
noteSchema.methods.toggleChecklistItem = function (itemId, completed, userId) {
  const item = this.checklist.id(itemId);
  if (!item) throw new Error(`Checklist item ${itemId} not found`);
  item.completed   = completed;
  item.completedAt = completed ? new Date() : undefined;
  item.completedBy = completed ? userId     : undefined;
  // Recompute progress
  const done    = this.checklist.filter(i => i.completed).length;
  this.progress = this.checklist.length
    ? Math.round((done / this.checklist.length) * 100)
    : 0;
};

/**
 * Add a watcher (idempotent).
 */
noteSchema.methods.addWatcher = function (userId) {
  if (!this.watchers.some(w => w.toString() === userId.toString())) {
    this.watchers.push(userId);
  }
};

/**
 * Share note with a specific user.
 * Updates permission if already shared.
 */
noteSchema.methods.shareWith = function (userId, permission = 'view', sharedBy) {
  const existing = this.sharedWith.find(s => s.user.toString() === userId.toString());
  if (existing) {
    existing.permission = permission;
  } else {
    this.sharedWith.push({ user: userId, permission, sharedBy, sharedAt: new Date() });
  }
  this.addWatcher(userId);
};

// ─────────────────────────────────────────────
//  STATIC METHODS
// ─────────────────────────────────────────────

/**
 * Build the access filter so any query respects visibility rules.
 * Use this in all controller find() calls.
 *
 * @param {ObjectId} userId
 * @param {ObjectId} organizationId
 * @param {string[]} [userDepartmentIds]  — for department-level visibility
 */
noteSchema.statics.accessFilter = function (userId, organizationId, userDepartmentIds = []) {
  return {
    organizationId,
    isDeleted: false,
    $or: [
      { owner: userId },
      { 'assignees.user':    userId },
      { watchers:            userId },
      { 'sharedWith.user':   userId },
      { visibility: 'organization' },
      ...(userDepartmentIds.length ? [{
        visibility: 'department',
        visibleToDepartments: { $in: userDepartmentIds },
      }] : []),
    ],
  };
};

/**
 * Heatmap data for activity calendar.
 */
noteSchema.statics.getHeatMapData = async function (userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        owner:     new mongoose.Types.ObjectId(userId),
        isDeleted: false,
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
      },
    },
    {
      $group: {
        _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
        types: { $addToSet: '$itemType' },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id:   0,
        date:  '$_id',
        count: 1,
        types: 1,
        // Scale intensity 0–4 for heatmap colouring
        intensity: { $min: [{ $floor: { $divide: ['$count', 3] } }, 4] },
      },
    },
  ]);
};

// ─────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────

module.exports             = mongoose.model('Note', noteSchema);
module.exports.ITEM_TYPES  = ITEM_TYPES;
module.exports.STATUSES    = STATUSES;
module.exports.PRIORITIES  = PRIORITIES;
module.exports.VISIBILITIES = VISIBILITIES;
module.exports.ASSIGNMENT_STATUSES = ASSIGNMENT_STATUSES;


// const mongoose = require('mongoose');
// const { Schema } = mongoose;

// const noteSchema = new Schema({
//   organizationId: { 
//     type: Schema.Types.ObjectId, 
//     ref: 'Organization', 
//     required: true, 
//     index: true 
//   },
//   owner: { 
//     type: Schema.Types.ObjectId, 
//     ref: 'User', 
//     required: true, 
//     index: true 
//   },
  
//   // FIXED: Added missing reference used in controllers
//   meetingId: {
//     type: Schema.Types.ObjectId,
//     ref: 'Meeting',
//     index: true
//   },

//   // Core Note Information
//   title: { 
//     type: String, 
//     trim: true, 
//     required: [true, 'Note title is required'] 
//   },
//   content: { 
//     type: String, 
//     required: [true, 'Content is required'] 
//   },
//   summary: { type: String, trim: true },
  
//   // Note Types
//   noteType: {
//     type: String,
//     enum: ['note', 'task', 'meeting', 'idea', 'journal', 'project'],
//     default: 'note',
//     index: true
//   },
  
//   // Status & Priority
//   status: {
//     type: String,
//     enum: ['draft', 'active', 'completed', 'archived', 'deferred'],
//     default: 'active',
//     index: true
//   },
//   priority: {
//     type: String,
//     enum: ['low', 'medium', 'high', 'urgent'],
//     default: 'medium',
//     index: true
//   },
  
//   // Time Management
//   startDate: { type: Date, index: true },
//   dueDate: { type: Date, index: true },
//   completedAt: Date,
//   duration: Number, // in minutes
  
//   // Categorization
//   category: { type: String, index: true },
//   tags: [{ 
//     type: String, 
//     lowercase: true, 
//     trim: true, 
//     index: true 
//   }],
  
//   // Meetings Specific Fields
//   isMeeting: { type: Boolean, default: false },
//   meetingDetails: {
//     agenda: String,
//     minutes: String,
//     location: String,
//     meetingType: {
//       type: String,
//       enum: ['in-person', 'virtual', 'hybrid']
//     },
//     videoLink: String,
//     recurrence: {
//       type: String,
//       enum: ['none', 'daily', 'weekly', 'monthly', 'yearly']
//     },
//     recurrenceEndDate: Date
//   },
  
//   // Participants
//   participants: [{
//     user: { type: Schema.Types.ObjectId, ref: 'User' },
//     role: { type: String, enum: ['organizer', 'attendee', 'contributor', 'viewer'] },
//     rsvp: {
//       type: String,
//       enum: ['pending', 'accepted', 'declined', 'tentative']
//     }
//   }],
  
//   // Attachments
//   attachments: [{
//     url: String,
//     publicId: String,
//     fileType: String,
//     fileName: String,
//     size: Number,
//     uploadedAt: { type: Date, default: Date.now }
//   }],
  
//   // References
//   relatedNotes: [{ type: Schema.Types.ObjectId, ref: 'Note' }],
//   projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
  
//   // Visibility
//   visibility: {
//     type: String,
//     enum: ['private', 'team', 'department', 'organization'],
//     default: 'private',
//     index: true
//   },
//   sharedWith: [{ 
//     type: Schema.Types.ObjectId, 
//     ref: 'User' 
//   }],
//   allowedDepartments: [{ 
//     type: Schema.Types.ObjectId, 
//     ref: 'Department' 
//   }],
  
//   // Metadata
//   isPinned: { type: Boolean, default: false, index: true },
//   isTemplate: { type: Boolean, default: false },
//   templateId: { type: Schema.Types.ObjectId, ref: 'Note' },
  
//   // Progress & Activity
//   progress: { type: Number, min: 0, max: 100, default: 0 },
//   subtasks: [{
//     title: String,
//     completed: { type: Boolean, default: false },
//     completedAt: Date
//   }],
//   activityLog: [{
//     action: String,
//     user: { type: Schema.Types.ObjectId, ref: 'User' },
//     timestamp: { type: Date, default: Date.now }
//   }],
//   lastAccessed: { type: Date, default: Date.now },
//   accessCount: { type: Number, default: 0 },
  
//   // Soft Delete
//   isDeleted: { type: Boolean, default: false, index: true },
//   deletedAt: Date,
//   deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
// }, { 
//   timestamps: true,
//   toJSON: { virtuals: true },
//   toObject: { virtuals: true }
// });

// // RESTORED: Virtuals
// noteSchema.virtual('isOverdue').get(function() {
//   if (!this.dueDate || this.status === 'completed') return false;
//   return this.dueDate < new Date();
// });

// noteSchema.virtual('timeRemaining').get(function() {
//   if (!this.dueDate || this.status === 'completed') return null;
//   return Math.max(0, this.dueDate - new Date());
// });

// noteSchema.virtual('formattedDate').get(function() {
//   return this.startDate ? this.startDate.toISOString().split('T')[0] : null;
// });

// // Indexes
// noteSchema.index({ organizationId: 1, owner: 1, noteType: 1, status: 1 });
// noteSchema.index({ organizationId: 1, dueDate: 1, priority: 1 });
// noteSchema.index({ organizationId: 1, isMeeting: 1, startDate: 1 });
// noteSchema.index({ 'participants.user': 1 });
// noteSchema.index({ createdAt: -1 });
// noteSchema.index({ updatedAt: -1 });
// noteSchema.index({ 
//   title: "text", 
//   content: "text", 
//   "meetingDetails.agenda": "text" 
// }, {
//   weights: {
//     title: 10,
//     "meetingDetails.agenda": 6,
//     content: 2
//   },
//   name: "NotesTextSearch"
// });

// // RESTORED: Pre-save middleware
// noteSchema.pre('save', function(next) {
//   if (this.isMeeting && !this.startDate) {
//     this.startDate = new Date();
//   }
  
//   if (this.status === 'completed' && !this.completedAt) {
//     this.completedAt = new Date();
//   }
  
//   if (this.isModified('content') && this.content.length > 200) {
//     this.summary = this.content.substring(0, 200) + '...';
//   }
  
//   next();
// });

// // RESTORED: Static methods
// noteSchema.statics.getHeatMapData = async function(userId, startDate, endDate) {
//   return this.aggregate([
//     {
//       $match: {
//         owner: mongoose.Types.ObjectId(userId),
//         createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
//         isDeleted: false
//       }
//     },
//     {
//       $group: {
//         _id: {
//           year: { $year: '$createdAt' },
//           month: { $month: '$createdAt' },
//           day: { $dayOfMonth: '$createdAt' }
//         },
//         count: { $sum: 1 },
//         notes: { $push: '$$ROOT._id' }
//       }
//     },
//     {
//       $project: {
//         _id: 0,
//         date: {
//           $dateFromParts: {
//             year: '$_id.year',
//             month: '$_id.month',
//             day: '$_id.day'
//           }
//         },
//         count: 1,
//         notes: 1
//       }
//     },
//     { $sort: { date: 1 } }
//   ]);
// };

// // RESTORED: Instance methods
// noteSchema.methods.addParticipant = function(userId, role = 'attendee') {
//   if (!this.participants.some(p => p.user.toString() === userId.toString())) {
//     this.participants.push({
//       user: userId,
//       role: role,
//       rsvp: 'pending'
//     });
//   }
// };

// noteSchema.methods.logActivity = function(action, userId) {
//   this.activityLog.push({
//     action,
//     user: userId,
//     timestamp: new Date()
//   });
//   this.lastAccessed = new Date();
//   this.accessCount += 1;
// };

// module.exports = mongoose.model('Note', noteSchema);
