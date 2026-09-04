const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const sessionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Session-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SESSION_DB_NAME || 'session_db');

module.exports = conn.model('Session', sessionSchema);
