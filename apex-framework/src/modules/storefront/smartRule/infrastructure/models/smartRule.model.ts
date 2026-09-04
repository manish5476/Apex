const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const smartRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add SmartRule-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SMARTRULE_DB_NAME || 'smartRule_db');

module.exports = conn.model('SmartRule', smartRuleSchema);
