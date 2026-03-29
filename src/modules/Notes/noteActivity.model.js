// modules/Notes/noteActivity.model.js
// ─────────────────────────────────────────────────────────────────────────────
//  Activity / audit log for Notes and Meetings.
//  Kept in a separate collection so the audit trail never bloats the parent
//  document and can grow indefinitely for compliance purposes.
//  All entries are append-only — no updates, no deletes.
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { Schema } = mongoose;

const noteActivitySchema = new Schema({

  // Parent document — one of these is set per entry
  noteId: { type: Schema.Types.ObjectId, ref: 'Note', index: true },
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', index: true },

  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

  // Who performed the action
  actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },

  // What happened
  action: {
    type: String,
    required: true,
    index: true,
    enum: [
      // Note lifecycle
      'created', 'updated', 'deleted', 'restored', 'archived',
      'pinned', 'unpinned', 'duplicated',
      // Status & priority
      'status_changed', 'priority_changed',
      // Assignment
      'assigned', 'unassigned',
      'assignment_accepted', 'assignment_declined', 'assignment_completed',
      // Checklist
      'checklist_item_added', 'checklist_item_completed',
      'checklist_item_uncompleted', 'checklist_item_removed',
      // Time tracking
      'time_logged',
      // Sharing
      'shared', 'unshared', 'permission_changed',
      // Comments
      'commented', 'comment_deleted',
      // Linking
      'linked', 'unlinked', 'parent_changed',
      // Attachments
      'attachment_added', 'attachment_removed',
      // Meeting lifecycle
      'meeting_created', 'meeting_updated',
      'meeting_cancelled', 'meeting_completed', 'meeting_postponed',
      // Meeting participation
      'rsvp_accepted', 'rsvp_declined', 'rsvp_tentative',
      'participant_joined', 'participant_left',
      'participant_added', 'participant_removed',
      // Meeting content
      'action_item_created', 'action_item_completed',
      'agenda_updated', 'minutes_updated',
      'poll_created', 'poll_voted',
      // Recurrence
      'recurrence_created', 'recurrence_skipped',
      // Access
      'viewed',
      // Template
      'template_created', 'created_from_template',
      // Conversion
      'converted_to_task', 'action_item_converted_to_task',
    ],
  },

  // Before/after diff for key field changes (e.g. status, priority)
  changes: {
    field: String,
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
  },

  // Extra context (e.g. assigned user name, checklist item title)
  meta: { type: Schema.Types.Mixed },

  // Request context
  ipAddress: String,
  userAgent: String,

}, {
  timestamps: true,
  // This collection is append-only — block updates at schema level
});

// ─────────────────────────────────────────────
//  INDEXES
// ─────────────────────────────────────────────

// Activity feed for a specific note
noteActivitySchema.index({ noteId: 1, createdAt: -1 });
noteActivitySchema.index({ meetingId: 1, createdAt: -1 });

// Org-wide activity dashboard
noteActivitySchema.index({ organizationId: 1, createdAt: -1 });
noteActivitySchema.index({ organizationId: 1, actor: 1, createdAt: -1 });
noteActivitySchema.index({ organizationId: 1, action: 1, createdAt: -1 });

// ─────────────────────────────────────────────
//  STATIC METHODS
// ─────────────────────────────────────────────

/**
 * Append an activity entry without loading the parent document.
 * Always call this after any mutation in a controller.
 * Errors are intentionally swallowed — activity logging must never
 * crash the main request flow.
 *
 * @example
 * await NoteActivity.log({ noteId, organizationId, actor: req.user._id, action: 'created' });
 */
noteActivitySchema.statics.log = async function ({
  noteId,
  meetingId,
  organizationId,
  actor,
  action,
  changes,
  meta,
  ipAddress,
  userAgent,
}) {
  try {
    return await this.create({
      noteId,
      meetingId,
      organizationId,
      actor,
      action,
      changes: changes || undefined,
      meta: meta || undefined,
      ipAddress: ipAddress || undefined,
      userAgent: userAgent || undefined,
    });
  } catch (err) {
    // Non-critical — log to console but never propagate
    console.error('[NoteActivity.log]', err.message);
    return null;
  }
};

module.exports = mongoose.model('NoteActivity', noteActivitySchema);