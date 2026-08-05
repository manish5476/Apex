const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const masterRecordSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add MasterRecord-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.MASTERRECORD_DB_NAME || 'masterRecord_db');

module.exports = conn.model('MasterRecord', masterRecordSchema);
