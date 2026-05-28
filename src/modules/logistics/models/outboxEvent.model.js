'use strict';

const mongoose = require('mongoose');

const outboxEventSchema = new mongoose.Schema({
  topic: { type: String, required: true, index: true },
  eventType: { type: String, required: true, index: true },
  aggregateType: { type: String, required: true, default: 'shipment' },
  aggregateId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending', 'processing', 'published', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, trim: true, default: '' },
  availableAt: { type: Date, default: Date.now, index: true },
  publishedAt: { type: Date, default: null }
}, { timestamps: true });

outboxEventSchema.index({ status: 1, availableAt: 1, createdAt: 1 });

module.exports = mongoose.model('LogisticsOutboxEvent', outboxEventSchema);
