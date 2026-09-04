const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Driver-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.DRIVER_DB_NAME || 'driver_db');

module.exports = conn.model('Driver', driverSchema);
