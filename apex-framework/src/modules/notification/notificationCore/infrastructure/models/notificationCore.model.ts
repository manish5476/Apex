const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const notificationCoreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add NotificationCore-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.NOTIFICATIONCORE_DB_NAME || 'notificationCore_db');

module.exports = conn.model('NotificationCore', notificationCoreSchema);
