const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const vehicleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Vehicle-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.VEHICLE_DB_NAME || 'vehicle_db');

module.exports = conn.model('Vehicle', vehicleSchema);
