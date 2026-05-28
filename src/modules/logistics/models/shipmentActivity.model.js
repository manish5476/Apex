'use strict';

const mongoose = require('mongoose');

const shipmentActivitySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'LogisticsShipment', required: true, index: true },
  type: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true },
  body: { type: String, trim: true, default: '' },
  actorId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  actorName: { type: String, trim: true, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

shipmentActivitySchema.index({ organizationId: 1, shipmentId: 1, occurredAt: -1 });

module.exports = mongoose.model('LogisticsShipmentActivity', shipmentActivitySchema);
