const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const channelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Channel-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.CHANNEL_DB_NAME || 'channel_db');

module.exports = conn.model('Channel', channelSchema);
