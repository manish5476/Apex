'use strict';

const mongoose = require('mongoose');

const shipmentEventSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  aggregateId: { type: mongoose.Schema.Types.ObjectId, ref: 'LogisticsShipment', required: true, index: true },
  eventType: { type: String, required: true, index: true },
  sequence: { type: Number, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  actorType: { type: String, trim: true, default: 'user' },
  fromStatus: { type: String, trim: true, default: '' },
  toStatus: { type: String, trim: true, default: '' },
  reason: { type: String, trim: true, default: '' },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  requestId: { type: String, trim: true, default: '' },
  occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

shipmentEventSchema.index({ aggregateId: 1, sequence: 1 }, { unique: true });
shipmentEventSchema.index({ organizationId: 1, eventType: 1, occurredAt: -1 });

module.exports = mongoose.model('LogisticsShipmentEvent', shipmentEventSchema);
