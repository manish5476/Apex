'use strict';

const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const addressSchema = new mongoose.Schema({
  fullName: { type: String, trim: true },
  phone: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
  state: { type: String, trim: true },
  city: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  addressLine1: { type: String, trim: true },
  addressLine2: { type: String, trim: true },
  landmark: { type: String, trim: true }
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  snapshot: {
    name: { type: String, required: true },
    slug: { type: String },
    sku: { type: String },
    image: { type: String },
    variantTitle: { type: String },
    sellingPrice: { type: Number, required: true },
    discountedPrice: { type: Number },
    taxRate: { type: Number, default: 0 },
    isTaxInclusive: { type: Boolean, default: false },
    hsnCode: { type: String }
  },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },
  discountAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  lineTotal: { type: Number, required: true }
}, { _id: true });

const timelineSchema = new mongoose.Schema({
  type: { type: String, required: true },
  message: { type: String, required: true },
  at: { type: Date, default: Date.now },
  actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const totalsSchema = new mongoose.Schema({
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  shipping: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' }
}, { _id: false });

const storefrontOrderSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  storefrontId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontCustomer', required: true, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontSession', default: null, index: true },
  guestOrder: { type: Boolean, default: false, index: true },
  orderNumber: { type: String, unique: true, index: true },
  cartId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontCart', default: null },

  billingAddress: { type: addressSchema, required: true },
  shippingAddress: { type: addressSchema, required: true },
  items: { type: [orderItemSchema], required: true },
  totals: { type: totalsSchema, required: true },
  totalAmount: { type: Number, default: 0 },
  appliedCoupons: { type: [String], default: [] },

  paymentMethod: {
    type: String,
    enum: ['COD', 'ONLINE', 'CARD', 'UPI', 'WALLET', 'BANK_TRANSFER'],
    default: 'COD',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'authorized', 'paid', 'failed', 'partially_refunded', 'refunded'],
    default: 'pending',
    index: true
  },
  fulfillmentStatus: {
    type: String,
    enum: ['unfulfilled', 'partial', 'fulfilled', 'shipped', 'delivered', 'returned'],
    default: 'unfulfilled',
    index: true
  },
  orderStatus: {
    type: String,
    enum: ['draft', 'placed', 'confirmed', 'processing', 'cancelled', 'closed'],
    default: 'placed',
    index: true
  },
  deliveryAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontDeliveryAgent', default: null, index: true },
  platformDeliveryAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformDeliveryAgent', default: null, index: true },
  fulfilledBy: { type: String, enum: ['merchant', 'platform'], default: 'merchant', index: true },
  deliveryFee: { type: Number, default: 0 },
  trackingNumber: { type: String, trim: true, default: '' },
  carrierName: { type: String, trim: true, default: '' },
  deliveryNotes: { type: String, trim: true, default: '' },
  estimatedDeliveryDate: { type: Date, default: null },

  timeline: { type: [timelineSchema], default: [] },
  notes: { type: String, trim: true, default: '' },
  internalNotes: { type: String, trim: true, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

storefrontOrderSchema.index({ organizationId: 1, orderStatus: 1, createdAt: -1 });
storefrontOrderSchema.index({ organizationId: 1, customerId: 1, createdAt: -1 });
storefrontOrderSchema.index({ organizationId: 1, guestOrder: 1, createdAt: -1 });

storefrontOrderSchema.pre('save', function (next) {
  if (this.totals?.grandTotal != null) {
    this.totalAmount = this.totals.grandTotal;
  }
  if (this.totals?.shipping != null) {
    this.deliveryFee = this.totals.shipping;
  }
  if (this.isNew && !this.orderNumber) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.orderNumber = `SF-${date}-${nanoid(7).toUpperCase()}`;
  }
  if (this.isNew && (!this.timeline || this.timeline.length === 0)) {
    this.timeline = [{ type: 'order_placed', message: 'Order placed' }];
  }
  next();
});

module.exports = mongoose.model('StorefrontOrder', storefrontOrderSchema);
