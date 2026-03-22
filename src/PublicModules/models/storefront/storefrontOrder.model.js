// src/storefront/models/storefrontOrder.model.js
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  snapshot: {
    name:           { type: String, required: true },
    slug:           { type: String },
    sku:            { type: String },
    image:          { type: String },
    sellingPrice:   { type: Number, required: true },
    discountedPrice:{ type: Number },
    taxRate:        { type: Number, default: 0 },
    isTaxInclusive: { type: Boolean, default: false },
    hsnCode:        { type: String } // GST compliance
  },
  quantity:    { type: Number, required: true, min: 1 },
  unitPrice:   { type: Number, required: true }, // actual price charged
  taxAmount:   { type: Number, default: 0 },
  lineTotal:   { type: Number, required: true }  // unitPrice * qty
}, { _id: true });

const addressSchema = new mongoose.Schema({
  name:    { type: String },
  phone:   { type: String },
  street:  { type: String },
  city:    { type: String },
  state:   { type: String },
  zipCode: { type: String },
  country: { type: String, default: 'India' }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  // Human-readable order number
  orderNumber: {
    type: String,
    unique: true
  },
  // Customer: may be a registered Customer doc or a guest
  customerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  guestEmail:    { type: String, trim: true, lowercase: true },
  guestPhone:    { type: String, trim: true },

  // Source cart (for auditing)
  cartId:        { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontCart' },

  items: { type: [orderItemSchema], required: true },

  shippingAddress: { type: addressSchema },
  billingAddress:  { type: addressSchema },

  // Financials — all stored explicitly for audit trail
  subtotal:       { type: Number, required: true },
  discountAmount: { type: Number, default: 0 },
  taxAmount:      { type: Number, default: 0 },
  shippingAmount: { type: Number, default: 0 },
  grandTotal:     { type: Number, required: true },
  currency:       { type: String, default: 'INR' },

  couponCode: { type: String },

  // Lifecycle
  status: {
    type: String,
    enum: ['pending','confirmed','processing','shipped','delivered','cancelled','refunded'],
    default: 'pending',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid','paid','partial','refunded'],
    default: 'unpaid'
  },
  paymentMethod:  { type: String },
  paymentRef:     { type: String }, // External payment gateway ref

  notes:          { type: String },
  internalNotes:  { type: String },
  cancelReason:   { type: String },

  confirmedAt: Date,
  shippedAt:   Date,
  deliveredAt: Date,
  cancelledAt: Date
}, { timestamps: true });

// Indexes
orderSchema.index({ organizationId: 1, status: 1 });
orderSchema.index({ organizationId: 1, customerId: 1 });
orderSchema.index({ organizationId: 1, createdAt: -1 });

// Auto-generate order number before insert
orderSchema.pre('save', async function (next) {
  if (this.isNew && !this.orderNumber) {
    // Format: ORD-{YYYYMMDD}-{6-char nanoid}
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.orderNumber = `ORD-${date}-${nanoid(6).toUpperCase()}`;
  }
  next();
});

module.exports = mongoose.model('StorefrontOrder', orderSchema);