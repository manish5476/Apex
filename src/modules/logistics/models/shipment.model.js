'use strict';

const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const { SHIPMENT_STATUSES } = require('../domain/shipmentStateMachine');

const coordinateSchema = new mongoose.Schema({
  lat: { type: Number, default: null },
  lng: { type: Number, default: null }
}, { _id: false });

const addressSchema = new mongoose.Schema({
  label: { type: String, trim: true, default: '' },
  fullName: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  country: { type: String, trim: true, default: 'India' },
  state: { type: String, trim: true, default: '' },
  city: { type: String, trim: true, default: '' },
  postalCode: { type: String, trim: true, default: '' },
  addressLine1: { type: String, trim: true, default: '' },
  addressLine2: { type: String, trim: true, default: '' },
  landmark: { type: String, trim: true, default: '' },
  coordinates: { type: coordinateSchema, default: () => ({}) }
}, { _id: false });

const parcelSchema = new mongoose.Schema({
  sku: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  quantity: { type: Number, min: 1, default: 1 },
  weightGrams: { type: Number, min: 0, default: 0 },
  lengthCm: { type: Number, min: 0, default: 0 },
  widthCm: { type: Number, min: 0, default: 0 },
  heightCm: { type: Number, min: 0, default: 0 },
  declaredValue: { type: Number, min: 0, default: 0 }
}, { _id: true });

const shipmentSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

  shipmentNumber: { type: String, unique: true, index: true },
  trackingNumber: { type: String, trim: true, index: true, default: '' },

  sourceType: {
    type: String,
    enum: ['storefront_order', 'sales_order', 'invoice', 'return', 'transfer', 'manual'],
    default: 'manual',
    index: true
  },
  sourceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  sourceNumber: { type: String, trim: true, default: '' },

  fulfillmentMode: {
    type: String,
    enum: ['merchant_internal', 'platform_partner', 'hybrid_ranked', 'manual_external', 'pickup_only'],
    default: 'merchant_internal',
    index: true
  },
  providerId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  assignedDriverId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  assignedVehicleId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

  status: {
    type: String,
    enum: Object.values(SHIPMENT_STATUSES),
    default: SHIPMENT_STATUSES.DRAFT,
    index: true
  },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal', index: true },
  serviceLevel: { type: String, enum: ['standard', 'express', 'same_day', 'scheduled'], default: 'standard', index: true },
  slaDeadlineAt: { type: Date, default: null, index: true },
  scheduledPickupAt: { type: Date, default: null, index: true },
  promisedDeliveryAt: { type: Date, default: null, index: true },

  pickupAddress: { type: addressSchema, required: true },
  dropoffAddress: { type: addressSchema, required: true },
  returnAddress: { type: addressSchema, default: null },
  parcels: { type: [parcelSchema], default: [] },

  cod: {
    enabled: { type: Boolean, default: false },
    amount: { type: Number, min: 0, default: 0 },
    collected: { type: Boolean, default: false },
    collectedAt: { type: Date, default: null }
  },

  customer: {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' }
  },

  lastEventType: { type: String, trim: true, default: '' },
  lastEventAt: { type: Date, default: null },
  notes: { type: String, trim: true, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

shipmentSchema.index({ organizationId: 1, businessId: 1, storeId: 1, status: 1, createdAt: -1 });
shipmentSchema.index({ organizationId: 1, trackingNumber: 1 });
shipmentSchema.index({ organizationId: 1, sourceType: 1, sourceId: 1 });
shipmentSchema.index({ fulfillmentMode: 1, providerId: 1, status: 1, createdAt: -1 });
shipmentSchema.index({ assignedDriverId: 1, status: 1, createdAt: -1 });

shipmentSchema.pre('save', function assignNumbers(next) {
  if (this.isNew && !this.shipmentNumber) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.shipmentNumber = `SHP-${date}-${nanoid(8).toUpperCase()}`;
  }

  if (this.isNew && !this.trackingNumber) {
    this.trackingNumber = `APX${nanoid(12).toUpperCase()}`;
  }

  next();
});

module.exports = mongoose.model('LogisticsShipment', shipmentSchema);
