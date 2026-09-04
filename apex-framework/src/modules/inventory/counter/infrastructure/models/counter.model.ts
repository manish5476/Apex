const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const counterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Counter-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.COUNTER_DB_NAME || 'counter_db');

module.exports = conn.model('Counter', counterSchema);
