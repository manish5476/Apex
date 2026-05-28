'use strict';

const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalDeliveryPartner', default: null, index: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

  type: { type: String, enum: ['bike', 'scooter', 'car', 'van', 'truck', 'cycle', 'other'], default: 'bike', index: true },
  registrationNumber: { type: String, trim: true, uppercase: true, default: '', index: true },
  capacityKg: { type: Number, default: 0, min: 0 },
  capacityVolumeCubicCm: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['available', 'assigned', 'maintenance', 'inactive'], default: 'available', index: true },
  documents: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

vehicleSchema.index({ organizationId: 1, registrationNumber: 1 });
vehicleSchema.index({ partnerId: 1, registrationNumber: 1 });

module.exports = mongoose.model('LogisticsVehicle', vehicleSchema);
