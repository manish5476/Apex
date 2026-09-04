const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const masterTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add MasterType-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.MASTERTYPE_DB_NAME || 'masterType_db');

module.exports = conn.model('MasterType', masterTypeSchema);
