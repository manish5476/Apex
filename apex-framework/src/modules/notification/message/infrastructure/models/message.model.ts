const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const messageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Message-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.MESSAGE_DB_NAME || 'message_db');

module.exports = conn.model('Message', messageSchema);
