const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const reviewCycleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add ReviewCycle-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.REVIEWCYCLE_DB_NAME || 'reviewCycle_db');

module.exports = conn.model('ReviewCycle', reviewCycleSchema);
