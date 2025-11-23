const mongoose = require('mongoose');
const { Schema } = mongoose;

const noteSchema = new Schema({
  // --- Core Links ---
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  branchId: {
    type: Schema.Types.ObjectId,
    ref: 'Branch',
    index: true,
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // --- Note content ---
  title: {
    type: String,
    trim: true,
  },
  content: {
    type: String,
    required: [true, 'A note must have some content'],
  },

  // UPDATED: Store both URL and Public ID
  attachments: [{
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    fileType: { type: String, default: 'image' } // Optional: useful if you upload PDFs later
  }],

  // // --- Note content ---
  // title: {
  //   type: String,
  //   trim: true,
  // },
  // content: {
  //   type: String,
  //   required: [true, 'A note must have some content'],
  // },
  // attachments: [{
  //   type: String,
  //   trim: true,
  // }],

  tags: [{
    type: String,
    trim: true,
  }],
  // --- References ---
  relatedTo: {
    type: String,
    enum: ['customer', 'product', 'invoice', 'purchase', 'other'],
    default: 'other',
  },
  relatedId: {
    type: Schema.Types.ObjectId,
    refPath: 'relatedTo',
  },

  // --- Pin / Delete ---
  isPinned: {
    type: Boolean,
    default: false,
  },
  isDeleted: {
    type: Boolean,
    default: false,
    select: false,
  },
  deletedAt: {
    type: Date,
    select: false,
  },
}, {
  timestamps: true,
});

// Index for faster searching by owner and content
noteSchema.index({ owner: 1, title: 'text', content: 'text' });

// Hide soft-deleted documents
noteSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: { $ne: true } });
  next();
});

const Note = mongoose.model('Note', noteSchema);
module.exports = Note;

