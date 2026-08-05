const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Role-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ROLE_DB_NAME || 'role_db');

module.exports = conn.model('Role', roleSchema);
