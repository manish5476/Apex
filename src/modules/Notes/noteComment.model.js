// modules/Notes/noteComment.model.js
// ─────────────────────────────────────────────────────────────────────────────
//  Comments / discussion threads for Notes and Meetings.
//  Kept in a separate collection so unbounded comment growth never bloats
//  the parent Note document toward the 16 MB BSON limit.
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────
//  Reaction sub-schema (emoji reactions — Slack / GitHub style)
// ─────────────────────────────────────────────
const reactionSchema = new Schema({
  emoji: { type: String, required: true },   // e.g. '👍', '✅', '🔥'
  users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { _id: false });

// ─────────────────────────────────────────────
//  MAIN COMMENT SCHEMA
// ─────────────────────────────────────────────
const noteCommentSchema = new Schema({

  // Parent document — at least one must be set (enforced in pre-validate)
  noteId: { type: Schema.Types.ObjectId, ref: 'Note', index: true },
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', index: true },

  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  content: { type: String, required: [true, 'Comment content is required'], trim: true },

  // Threading — reply to another comment
  parentCommentId: { type: Schema.Types.ObjectId, ref: 'NoteComment', index: true },
  threadDepth: { type: Number, default: 0 },   // 0 = top-level, 1 = reply

  // Emoji reactions
  reactions: [reactionSchema],

  // @mentions parsed from content
  mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],

  // Attachments on the comment (e.g. screenshot)
  attachments: [{
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset' },
    url: String,
    fileName: String,
    fileType: String,
    size: Number,
  }],

  // Edit tracking
  isEdited: { type: Boolean, default: false },
  editedAt: Date,
  editHistory: [{ content: String, editedAt: { type: Date, default: Date.now } }],

  // Soft delete
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: Date,
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  INDEXES
// ─────────────────────────────────────────────
noteCommentSchema.index({ noteId: 1, parentCommentId: 1, createdAt: -1 });
noteCommentSchema.index({ meetingId: 1, parentCommentId: 1, createdAt: -1 });
noteCommentSchema.index({ parentCommentId: 1, createdAt: 1 });
noteCommentSchema.index({ organizationId: 1, author: 1, createdAt: -1 });

// ─────────────────────────────────────────────
//  PRE-VALIDATE
// ─────────────────────────────────────────────
noteCommentSchema.pre('validate', function (next) {
  if (!this.noteId && !this.meetingId) {
    return next(new Error('Comment must belong to either a Note or a Meeting'));
  }
  next();
});

// ─────────────────────────────────────────────
//  INSTANCE METHODS
// ─────────────────────────────────────────────

/**
 * Toggle an emoji reaction (add if not present, remove if present).
 */
noteCommentSchema.methods.toggleReaction = function (emoji, userId) {
  let reaction = this.reactions.find(r => r.emoji === emoji);
  if (!reaction) {
    this.reactions.push({ emoji, users: [userId] });
    return;
  }
  const idx = reaction.users.findIndex(u => u.toString() === userId.toString());
  if (idx > -1) {
    reaction.users.splice(idx, 1);
    if (reaction.users.length === 0) {
      this.reactions = this.reactions.filter(r => r.emoji !== emoji);
    }
  } else {
    reaction.users.push(userId);
  }
};

module.exports = mongoose.model('NoteComment', noteCommentSchema);

// // models/noteCommentModel.js
// // ─────────────────────────────────────────────────────────────────────────────
// //  Comments / discussion threads for Notes and Meetings.
// //
// //  WHY a separate collection:
// //   - An active note can accumulate thousands of comments over months.
// //   - Embedding an unbounded array inside the parent document risks the
// //     MongoDB 16 MB BSON document limit and causes unnecessary data transfer
// //     (every Note.find() would pull all comments).
// //   - Separate collection = efficient pagination, independent queries,
// //     no parent document bloat.
// // ─────────────────────────────────────────────────────────────────────────────

// const mongoose = require('mongoose');
// const { Schema } = mongoose;

// // ─────────────────────────────────────────────
// //  Reaction sub-schema (emoji reactions, like Slack/GitHub)
// // ─────────────────────────────────────────────
// const reactionSchema = new Schema({
//   emoji: { type: String, required: true },  // e.g. '👍', '✅', '🔥'
//   users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
// }, { _id: false });

// // ─────────────────────────────────────────────
// //  MAIN COMMENT SCHEMA
// // ─────────────────────────────────────────────
// const noteCommentSchema = new Schema({

//   // Parent document (note OR meeting — one of these must be set)
//   noteId: { type: Schema.Types.ObjectId, ref: 'Note', index: true },
//   meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', index: true },

//   organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

//   author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

//   content: { type: String, required: [true, 'Comment content is required'], trim: true },

//   // Threading: reply to another comment
//   parentCommentId: { type: Schema.Types.ObjectId, ref: 'NoteComment', index: true },
//   threadDepth: { type: Number, default: 0 },  // 0 = top-level, 1 = reply, 2 = reply to reply

//   // Reactions (emoji responses)
//   reactions: [reactionSchema],

//   // Mentions (parsed from @username syntax in content)
//   mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],

//   // Attachments on the comment (e.g. screenshot, file)
//   attachments: [{
//     assetId: { type: Schema.Types.ObjectId, ref: 'Asset' },
//     url: String,
//     fileName: String,
//     fileType: String,
//     size: Number,
//   }],

//   // Edit history
//   isEdited: { type: Boolean, default: false },
//   editedAt: Date,
//   editHistory: [{
//     content: String,
//     editedAt: { type: Date, default: Date.now },
//   }],

//   // Soft delete
//   isDeleted: { type: Boolean, default: false, index: true },
//   deletedAt: Date,
//   deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },

// }, {
//   timestamps: true,
// });

// // ─────────────────────────────────────────────
// //  INDEXES
// // ─────────────────────────────────────────────

// // Fetch all top-level comments for a note, newest first
// noteCommentSchema.index({ noteId: 1, parentCommentId: 1, createdAt: -1 });
// noteCommentSchema.index({ meetingId: 1, parentCommentId: 1, createdAt: -1 });

// // Thread: all replies to a comment
// noteCommentSchema.index({ parentCommentId: 1, createdAt: 1 });

// // User's comment history
// noteCommentSchema.index({ organizationId: 1, author: 1, createdAt: -1 });

// // ─────────────────────────────────────────────
// //  PRE-VALIDATE
// // ─────────────────────────────────────────────

// noteCommentSchema.pre('validate', function (next) {
//   if (!this.noteId && !this.meetingId) {
//     return next(new Error('Comment must belong to either a Note or a Meeting'));
//   }
//   next();
// });

// // ─────────────────────────────────────────────
// //  INSTANCE METHODS
// // ─────────────────────────────────────────────

// /**
//  * Add or remove an emoji reaction (toggle).
//  */
// noteCommentSchema.methods.toggleReaction = function (emoji, userId) {
//   let reaction = this.reactions.find(r => r.emoji === emoji);
//   if (!reaction) {
//     this.reactions.push({ emoji, users: [userId] });
//     return;
//   }
//   const userStr = userId.toString();
//   const idx = reaction.users.findIndex(u => u.toString() === userStr);
//   if (idx > -1) {
//     reaction.users.splice(idx, 1);                         // Remove
//     if (reaction.users.length === 0) {
//       this.reactions = this.reactions.filter(r => r.emoji !== emoji);
//     }
//   } else {
//     reaction.users.push(userId);                           // Add
//   }
// };

// module.exports = mongoose.model('NoteComment', noteCommentSchema);


// // ═══════════════════════════════════════════════════════════════════════════
// //  models/noteActivityModel.js
// //  Activity / audit log for Notes and Meetings.
// //
// //  WHY separate:
// //   - Same reason as NoteComment — unbounded over time.
// //   - Activity logs should never be deleted (compliance) but we don't want
// //     them bloating the parent document.
// // ═══════════════════════════════════════════════════════════════════════════

// const noteActivitySchema = new Schema({

//   // Parent document
//   noteId: { type: Schema.Types.ObjectId, ref: 'Note', index: true },
//   meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', index: true },

//   organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

//   // Who did it
//   actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },

//   // What happened
//   action: {
//     type: String,
//     enum: [
//       // Note actions
//       'created', 'updated', 'deleted', 'restored', 'archived', 'pinned', 'unpinned',
//       // Status changes
//       'status_changed', 'priority_changed',
//       // Assignment
//       'assigned', 'unassigned', 'assignment_accepted', 'assignment_declined',
//       'assignment_completed',
//       // Checklist
//       'checklist_item_added', 'checklist_item_completed', 'checklist_item_uncompleted',
//       'checklist_item_removed',
//       // Time
//       'time_logged',
//       // Sharing
//       'shared', 'unshared', 'permission_changed',
//       // Comments
//       'commented', 'comment_deleted',
//       // Linking
//       'linked', 'unlinked', 'parent_changed',
//       // Attachments
//       'attachment_added', 'attachment_removed',
//       // Meeting actions
//       'meeting_created', 'meeting_updated', 'meeting_cancelled', 'meeting_completed',
//       'rsvp_accepted', 'rsvp_declined', 'rsvp_tentative',
//       'participant_joined', 'participant_left',
//       'action_item_created', 'action_item_completed',
//       'agenda_updated', 'minutes_updated',
//       // Recurrence
//       'recurrence_created', 'recurrence_skipped',
//       // Viewed
//       'viewed',
//     ],
//     required: true,
//     index: true,
//   },

//   // Flexible diff payload — stores before/after for key field changes
//   changes: {
//     field: String,    // Which field changed
//     oldValue: Schema.Types.Mixed,
//     newValue: Schema.Types.Mixed,
//   },

//   // Additional context (e.g. assigned user's name, checklist item title)
//   meta: { type: Schema.Types.Mixed },

//   // Client context
//   ipAddress: String,
//   userAgent: String,

// }, {
//   timestamps: true,
//   // Activity logs are append-only — no updates
// });

// // ─────────────────────────────────────────────
// //  INDEXES
// // ─────────────────────────────────────────────

// // Activity feed for a specific note
// noteActivitySchema.index({ noteId: 1, createdAt: -1 });
// noteActivitySchema.index({ meetingId: 1, createdAt: -1 });

// // Org-wide activity feed (dashboard)
// noteActivitySchema.index({ organizationId: 1, createdAt: -1 });
// noteActivitySchema.index({ organizationId: 1, actor: 1, createdAt: -1 });
// noteActivitySchema.index({ organizationId: 1, action: 1, createdAt: -1 });

// // ─────────────────────────────────────────────
// //  STATICS
// // ─────────────────────────────────────────────

// /**
//  * Append an activity record without loading the parent document.
//  * Call this from controllers after any mutation.
//  */
// noteActivitySchema.statics.log = async function ({
//   noteId, meetingId, organizationId, actor, action, changes, meta, ipAddress, userAgent,
// }) {
//   return this.create({
//     noteId, meetingId, organizationId, actor, action,
//     changes: changes || undefined,
//     meta: meta || undefined,
//     ipAddress, userAgent,
//   });
// };

// module.exports.NoteActivity = mongoose.model('NoteActivity', noteActivitySchema);