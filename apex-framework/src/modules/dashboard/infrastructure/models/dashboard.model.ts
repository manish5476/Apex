const mongoose = require('mongoose');
const { getConnection } = require('../../../../core/database');

const dashboardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Dashboard-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.DASHBOARD_DB_NAME || 'dashboard_db');

module.exports = conn.model('Dashboard', dashboardSchema);
