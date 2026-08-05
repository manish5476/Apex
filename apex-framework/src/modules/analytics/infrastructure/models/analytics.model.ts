const mongoose = require('mongoose');
const { getConnection } = require('../../../../core/database');

const analyticsSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Analytics-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ANALYTICS_DB_NAME || 'analytics_db');

module.exports = conn.model('Analytics', analyticsSchema);
