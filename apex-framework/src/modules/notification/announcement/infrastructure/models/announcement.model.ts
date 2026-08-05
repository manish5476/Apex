const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const announcementSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Announcement-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ANNOUNCEMENT_DB_NAME || 'announcement_db');

module.exports = conn.model('Announcement', announcementSchema);
