const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Account-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ACCOUNT_DB_NAME || 'account_db');

module.exports = conn.model('Account', accountSchema);
