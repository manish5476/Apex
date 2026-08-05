const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Branch-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.BRANCH_DB_NAME || 'branch_db');

module.exports = conn.model('Branch', branchSchema);
