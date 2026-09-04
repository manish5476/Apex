const mongoose = require('mongoose');
const { getConnection } = require('../../../../core/database');

const feedSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Feed-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.FEED_DB_NAME || 'feed_db');

module.exports = conn.model('Feed', feedSchema);
