const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const geoFencingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add GeoFencing-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.GEOFENCING_DB_NAME || 'geoFencing_db');

module.exports = conn.model('GeoFencing', geoFencingSchema);
