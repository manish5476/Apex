const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const meetingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Meeting-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.MEETING_DB_NAME || 'meeting_db');

module.exports = conn.model('Meeting', meetingSchema);
