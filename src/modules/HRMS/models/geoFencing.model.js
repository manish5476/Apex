const mongoose = require('mongoose');

const geofenceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

  // --- Location Types ---
  type: {
    type: String,
    enum: ['circle', 'polygon', 'building', 'custom'],
    default: 'circle'
  },

  // --- Circle: center + radius ---
  center: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], index: '2dsphere' } // [longitude, latitude]
  },
  radius: { type: Number, min: 10, max: 10000 }, // in meters

  // --- Polygon: array of coordinates ---
  polygon: {
    type: { type: String, default: 'Polygon' },
    coordinates: { type: [[[Number]]], index: '2dsphere' }
  },

  // --- Address ---
  address: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    country: String,
    pincode: String
  },

  // --- Rules ---
  allowedEntryTypes: [{
    type: String,
    enum: ['in', 'out', 'both'],
    default: 'both'
  }],

  timeRestrictions: [{
    dayOfWeek: [Number], // 0-6
    startTime: String,
    endTime: String,
    allowed: { type: Boolean, default: true }
  }],

  // --- Applicability ---
  applicableUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  applicableDepartments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
  applicableDesignations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],
  applicableToAll: { type: Boolean, default: true },

  // --- Status ---
  isActive: { type: Boolean, default: true },

  // --- Metadata ---
  metadata: {
    totalCheckIns: { type: Number, default: 0 },
    totalCheckOuts: { type: Number, default: 0 },
    lastUsedAt: Date
  },

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true });

geofenceSchema.index({ organizationId: 1, code: 1 }, { unique: true });

// --- METHODS ---
geofenceSchema.methods.isPointInside = function(longitude, latitude) {
  if (this.type === 'circle' && this.center && this.radius) {
    // Calculate distance from center
    const R = 6371e3; // Earth's radius in meters
    const φ1 = latitude * Math.PI / 180;
    const φ2 = this.center.coordinates[1] * Math.PI / 180;
    const Δφ = (this.center.coordinates[1] - latitude) * Math.PI / 180;
    const Δλ = (this.center.coordinates[0] - longitude) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance <= this.radius;
  }
  
  // Polygon check would be more complex
  // For now, return true if no restrictions
  return true;
};

module.exports = mongoose.model('GeoFence', geofenceSchema);