// src/storefront/models/storefrontCart.model.js
const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  // Snapshot at time of add — prevents price drift
  snapshot: {
    name:           { type: String, required: true },
    slug:           { type: String, required: true },
    image:          { type: String },
    sku:            { type: String },
    sellingPrice:   { type: Number, required: true },
    discountedPrice:{ type: Number },
    taxRate:        { type: Number, default: 0 },
    isTaxInclusive: { type: Boolean, default: false }
  },
  quantity:  { type: Number, required: true, min: 1, default: 1 },
  // Branchid for multi-branch stock reservation
  branchId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }
}, { _id: true, timestamps: false });

// Virtual: line total using discounted price if available
cartItemSchema.virtual('lineTotal').get(function () {
  const price = this.snapshot.discountedPrice || this.snapshot.sellingPrice;
  return parseFloat((price * this.quantity).toFixed(2));
});

const cartSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  // One of these will be set — guest or logged-in customer
  customerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
  sessionToken:{ type: String, index: true }, // For guest carts

  items: { type: [cartItemSchema], default: [] },

  // Applied promo/coupon (placeholder for future)
  couponCode:    { type: String, trim: true, uppercase: true, default: null },
  discountAmount:{ type: Number, default: 0 },

  // Cart-level metadata
  notes:     { type: String, trim: true },
  expiresAt: {
    type: Date,
    // Guest carts expire in 7 days, customer carts in 30
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  },
  status: {
    type: String,
    enum: ['active', 'merged', 'converted', 'abandoned'],
    default: 'active',
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// TTL index — MongoDB auto-deletes expired carts
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
cartSchema.index({ organizationId: 1, status: 1 });

// Virtual: subtotal before discount
cartSchema.virtual('subtotal').get(function () {
  return parseFloat(
    this.items.reduce((sum, item) => {
      const price = item.snapshot.discountedPrice || item.snapshot.sellingPrice;
      return sum + price * item.quantity;
    }, 0).toFixed(2)
  );
});

module.exports = mongoose.model('StorefrontCart', cartSchema);