const mongoose = require('mongoose');
const { Schema } = mongoose;

const noteSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', index: true },

    title: String,
    content: { type: String, required: true },

    noteDate: { type: Date, default: Date.now, index: true },

    visibility: {
      type: String,
      enum: ['public', 'private', 'team'],
      default: 'public',
      index: true,
    },

    importance: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal',
      index: true,
    },

    attachments: [
      {
        url: String,
        publicId: String,
        fileType: String,
      },
    ],

    tags: [{ type: String, index: true }],

    relatedTo: String,
    relatedId: Schema.Types.ObjectId,

    isPinned: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  { timestamps: true }
);

noteSchema.index({ title: 'text', content: 'text', tags: 'text' });
noteSchema.index({ organizationId: 1, noteDate: 1 });

module.exports = mongoose.model('Note', noteSchema);


// const mongoose = require('mongoose');
// const { Schema } = mongoose;

// const noteSchema = new Schema({
//   // --- Core Links ---
//   organizationId: {
//     type: Schema.Types.ObjectId,
//     ref: 'Organization',
//     required: true,
//     index: true,
//   },
//   branchId: {
//     type: Schema.Types.ObjectId,
//     ref: 'Branch',
//     index: true,
//   },
//   owner: {
//     type: Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//     index: true,
//   },

//   // --- Content ---
//   title: {
//     type: String,
//     trim: true,
//   },
//   content: {
//     type: String,
//     required: [true, 'A note must have some content'],
//   },

//   // ✅ NEW: Date Handling (For Calendar / Timeline)
//   // 'createdAt' is when you typed it. 'noteDate' is the actual date of the event/note.
//   noteDate: {
//     type: Date,
//     default: Date.now,
//     index: true 
//   },

//   // ✅ NEW: Enterprise Visibility
//   // 'public': Visible to everyone in Org
//   // 'private': Visible ONLY to Owner
//   // 'team': Visible to Branch/Team (Scalable)
//   visibility: { 
//       type: String, 
//       enum: ['public', 'private', 'team'], 
//       default: 'public' 
//   },

//   // ✅ NEW: Priority Flag
//   importance: {
//     type: String,
//     enum: ['low', 'normal', 'high'],
//     default: 'normal'
//   },

//   // --- Attachments ---
//   attachments: [{
//     url: { type: String, required: true },
//     publicId: { type: String, required: true },
//     fileType: { type: String, default: 'image' }
//   }],

//   tags: [{
//     type: String,
//     trim: true,
//   }],

//   // --- References (Polymorphic) ---
//   relatedTo: {
//     type: String,
//     enum: ['customer', 'product', 'invoice', 'purchase', 'other'],
//     default: 'other',
//   },
//   relatedId: {
//     type: Schema.Types.ObjectId,
//     refPath: 'relatedTo',
//   },

//   // --- Meta ---
//   isPinned: {
//     type: Boolean,
//     default: false,
//   },
//   isDeleted: {
//     type: Boolean,
//     default: false,
//     select: false,
//   },
//   deletedAt: {
//     type: Date,
//     select: false,
//   },
// }, {
//   timestamps: true,
// });

// // Indexes for High Performance
// noteSchema.index({ organizationId: 1, noteDate: 1 });
// noteSchema.index({ organizationId: 1, title: 'text', content: 'text' }); // Full Text Search

// // Soft Delete Hiding
// noteSchema.pre(/^find/, function (next) {
//   this.where({ isDeleted: { $ne: true } });
//   next();
// });

// const Note = mongoose.model('Note', noteSchema);
// module.exports = Note;
