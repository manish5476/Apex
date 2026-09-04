const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add User-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.USER_DB_NAME || 'user_db');

module.exports = conn.model('User', userSchema);
