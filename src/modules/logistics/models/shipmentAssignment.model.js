'use strict';

const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'LogisticsShipment', required: true, index: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalDeliveryPartner', default: null, index: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'LogisticsDriver', default: null, index: true },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LogisticsVehicle', default: null, index: true },
  mode: { type: String, enum: ['auto', 'manual', 'batch', 'partner_offer', 'reassignment'], default: 'manual', index: true },
  status: { type: String, enum: ['reserved', 'offered', 'accepted', 'rejected', 'expired', 'cancelled'], default: 'reserved', index: true },
  score: { type: Number, default: 0 },
  scoringTrace: { type: mongoose.Schema.Types.Mixed, default: {} },
  offeredAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

assignmentSchema.index({ shipmentId: 1, status: 1 });
assignmentSchema.index({ driverId: 1, status: 1, createdAt: -1 });
assignmentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('LogisticsShipmentAssignment', assignmentSchema);
