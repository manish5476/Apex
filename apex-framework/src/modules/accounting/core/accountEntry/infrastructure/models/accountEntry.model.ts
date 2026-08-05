const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const accountEntrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add AccountEntry-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ACCOUNTENTRY_DB_NAME || 'accountEntry_db');

module.exports = conn.model('AccountEntry', accountEntrySchema);
