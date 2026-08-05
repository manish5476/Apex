const mongoose = require('mongoose');
const { getConnection } = require('../../../../core/database');

const activitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Activity-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ACTIVITY_DB_NAME || 'activity_db');

module.exports = conn.model('Activity', activitySchema);
