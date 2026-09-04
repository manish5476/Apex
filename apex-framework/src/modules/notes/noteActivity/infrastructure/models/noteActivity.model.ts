const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const noteActivitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add NoteActivity-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.NOTEACTIVITY_DB_NAME || 'noteActivity_db');

module.exports = conn.model('NoteActivity', noteActivitySchema);
