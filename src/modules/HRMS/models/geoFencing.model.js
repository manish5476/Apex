const mongoose = require('mongoose');

const geofenceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },

  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',       index: true },

  type: {
    type: String,
    enum: ['circle', 'polygon', 'building', 'custom'],
    default: 'circle',
  },

  // --- Circle: center GeoJSON Point + radius ---
  center: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] }, // [longitude, latitude]
  },
  radius: { type: Number, min: 10, max: 10000 }, // metres

  // --- Polygon: GeoJSON Polygon ---
  polygon: {
    type:        { type: String, enum: ['Polygon'], default: 'Polygon' },
    coordinates: { type: [[[Number]]] },
  },

  // --- Address ---
  address: {
    line1:   String,
    line2:   String,
    city:    String,
    state:   String,
    country: String,
    pincode: String,
  },

  // FIX BUG-GF-03 [MEDIUM] — allowedEntryTypes changed from Array to single String.
  // Original was `[{ type: String, enum: ['in', 'out', 'both'] }]` — an array of strings.
  // Having 'in' AND 'both' in the same array is semantically contradictory.
  // This should be a single field defining the fence's entry restriction.
  allowedEntryTypes: {
    type: String,
    enum: ['in', 'out', 'both'],
    default: 'both',
  },

  timeRestrictions: [{
    dayOfWeek: [Number], // 0–6
    startTime: String,
    endTime:   String,
    allowed:   { type: Boolean, default: true },
  }],

  // --- Applicability ---
  applicableUsers:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  applicableDepartments:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
  applicableDesignations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],
  applicableToAll:        { type: Boolean, default: true },

  isActive: { type: Boolean, default: true },

  metadata: {
    totalCheckIns:  { type: Number, default: 0 },
    totalCheckOuts: { type: Number, default: 0 },
    lastUsedAt:     Date,
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
geofenceSchema.index({ organizationId: 1, code: 1 }, { unique: true });

// FIX BUG-GF-02 [MEDIUM] — Use sparse 2dsphere indexes so documents of the wrong
// type (e.g., polygon docs with null center.coordinates) don't cause index errors.
geofenceSchema.index({ 'center': '2dsphere' }, { sparse: true });
geofenceSchema.index({ 'polygon': '2dsphere' }, { sparse: true });

// ─────────────────────────────────────────────
//  Methods
// ─────────────────────────────────────────────

/**
 * Check if a coordinate point is inside this geofence.
 *
 * FIX BUG-GF-01 [HIGH] — Polygon type previously returned `true` silently (false positive).
 * Every employee checking in from ANY location would pass a polygon geofence.
 * Now throws NotImplemented for polygon (use MongoDB $geoWithin in your controller instead).
 *
 * For circle types, the Haversine formula is correct and unchanged.
 *
 * @param {number} longitude
 * @param {number} latitude
 * @returns {boolean}
 */
geofenceSchema.methods.isPointInside = function (longitude, latitude) {
  if (this.type === 'circle') {
    if (!this.center || !this.center.coordinates || !this.radius) {
      throw new Error('Circle geofence is missing center coordinates or radius');
    }
    const R  = 6371e3; // Earth radius in metres
    const φ1 = (latitude)                      * Math.PI / 180;
    const φ2 = (this.center.coordinates[1])    * Math.PI / 180;
    const Δφ = (this.center.coordinates[1] - latitude)  * Math.PI / 180;
    const Δλ = (this.center.coordinates[0] - longitude) * Math.PI / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c        = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance <= this.radius;
  }

  if (this.type === 'polygon' || this.type === 'building' || this.type === 'custom') {
    // FIX BUG-GF-01: Do NOT silently return true for unimplemented types.
    // Use MongoDB's native $geoWithin query in your controller for polygon checks:
    //   GeoFence.findOne({ _id: geofenceId, polygon: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [lng, lat] } } } })
    throw new Error(
      `isPointInside() does not support type '${this.type}'. Use MongoDB $geoWithin query instead.`
    );
  }

  return false;
};

module.exports = mongoose.model('GeoFence', geofenceSchema);

// const mongoose = require('mongoose');

// const geofenceSchema = new mongoose.Schema({
//   name: { type: String, required: true, trim: true },
//   code: { type: String, required: true, trim: true, uppercase: true },
  
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

//   // --- Location Types ---
//   type: {
//     type: String,
//     enum: ['circle', 'polygon', 'building', 'custom'],
//     default: 'circle'
//   },

//   // --- Circle: center + radius ---
//   center: {
//     type: { type: String, default: 'Point' },
//     coordinates: { type: [Number], index: '2dsphere' } // [longitude, latitude]
//   },
//   radius: { type: Number, min: 10, max: 10000 }, // in meters

//   // --- Polygon: array of coordinates ---
//   polygon: {
//     type: { type: String, default: 'Polygon' },
//     coordinates: { type: [[[Number]]], index: '2dsphere' }
//   },

//   // --- Address ---
//   address: {
//     line1: String,
//     line2: String,
//     city: String,
//     state: String,
//     country: String,
//     pincode: String
//   },

//   // --- Rules ---
//   allowedEntryTypes: [{
//     type: String,
//     enum: ['in', 'out', 'both'],
//     default: 'both'
//   }],

//   timeRestrictions: [{
//     dayOfWeek: [Number], // 0-6
//     startTime: String,
//     endTime: String,
//     allowed: { type: Boolean, default: true }
//   }],

//   // --- Applicability ---
//   applicableUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
//   applicableDepartments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
//   applicableDesignations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],
//   applicableToAll: { type: Boolean, default: true },

//   // --- Status ---
//   isActive: { type: Boolean, default: true },

//   // --- Metadata ---
//   metadata: {
//     totalCheckIns: { type: Number, default: 0 },
//     totalCheckOuts: { type: Number, default: 0 },
//     lastUsedAt: Date
//   },

//   // --- Audit ---
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

// }, { timestamps: true });

// geofenceSchema.index({ organizationId: 1, code: 1 }, { unique: true });

// // --- METHODS ---
// geofenceSchema.methods.isPointInside = function(longitude, latitude) {
//   if (this.type === 'circle' && this.center && this.radius) {
//     // Calculate distance from center
//     const R = 6371e3; // Earth's radius in meters
//     const φ1 = latitude * Math.PI / 180;
//     const φ2 = this.center.coordinates[1] * Math.PI / 180;
//     const Δφ = (this.center.coordinates[1] - latitude) * Math.PI / 180;
//     const Δλ = (this.center.coordinates[0] - longitude) * Math.PI / 180;

//     const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
//               Math.cos(φ1) * Math.cos(φ2) *
//               Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//     const distance = R * c;

//     return distance <= this.radius;
//   }
  
//   // Polygon check would be more complex
//   // For now, return true if no restrictions
//   return true;
// };

// module.exports = mongoose.model('GeoFence', geofenceSchema);