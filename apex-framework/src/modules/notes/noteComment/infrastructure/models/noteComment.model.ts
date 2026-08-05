const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const noteCommentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add NoteComment-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.NOTECOMMENT_DB_NAME || 'noteComment_db');

module.exports = conn.model('NoteComment', noteCommentSchema);
