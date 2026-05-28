'use strict';

const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalDeliveryPartner', default: null, index: true },
  identityUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: '' },
  employmentType: { type: String, enum: ['internal', 'partner', 'contract'], default: 'internal', index: true },
  status: { type: String, enum: ['available', 'busy', 'offline', 'inactive'], default: 'offline', index: true },
  currentVehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LogisticsVehicle', default: null },
  capacityUnits: { type: Number, default: 1, min: 0 },
  activeShipmentCount: { type: Number, default: 0, min: 0 },
  lastLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    accuracyMeters: { type: Number, default: null },
    capturedAt: { type: Date, default: null }
  },
  zones: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LogisticsGeoZone' }],
  documents: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

driverSchema.index({ organizationId: 1, phone: 1 }, { unique: true, partialFilterExpression: { organizationId: { $type: 'objectId' } } });
driverSchema.index({ partnerId: 1, phone: 1 }, { unique: true, partialFilterExpression: { partnerId: { $type: 'objectId' } } });
driverSchema.index({ status: 1, activeShipmentCount: 1, updatedAt: -1 });

module.exports = mongoose.model('LogisticsDriver', driverSchema);
