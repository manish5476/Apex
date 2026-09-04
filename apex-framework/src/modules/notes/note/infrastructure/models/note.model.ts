const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const noteSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Note-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.NOTE_DB_NAME || 'note_db');

module.exports = conn.model('Note', noteSchema);
