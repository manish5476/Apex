const mongoose = require('mongoose');
const { Schema } = mongoose;

const noteSchema = new Schema({
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: [false, 'A note must have a title'],
    trim: true
  },
  content: {
    type: String,
    required: [true, 'A note must have some content']
  },
  tags: [{
    type: String,
    trim: true
  }],
  attachments: [{
    type: String, // URLs to images or other files
    trim: true
  }],
  relatedTo: {
    type: String,
    enum: ['customer', 'product', 'invoice', 'other'],
    default: 'other'
  },
  relatedId: {
    type: Schema.Types.ObjectId,
    refPath: 'relatedTo'
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false,
    select: false
  },
  deletedAt: {
    type: Date,
    select: false
  },
}, {
  timestamps: true
});

// Index for faster searching by owner and title
noteSchema.index({ owner: 1, title: 'text', content: 'text' });

// Middleware to automatically hide soft-deleted documents
noteSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: { $ne: true } });
  next();
});

const Note = mongoose.model('Note', noteSchema);

module.exports = Note;