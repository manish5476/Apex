const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
const slugify = (value) =>
  value.toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ─────────────────────────────────────────────
//  Sub-Schema: Branch Inventory
// ─────────────────────────────────────────────
const inventorySchema = new mongoose.Schema({
  branchId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  quantity:     { type: Number, required: true, default: 0, min: 0 },
  reorderLevel: { type: Number, default: 10, min: 0 },
  rackLocation: { type: String, trim: true },
}, { _id: false });

// ─────────────────────────────────────────────
//  Main Product Schema
// ─────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

  // Basic Info
  name:        { type: String, required: [true, 'Product name is required'], trim: true },
  slug:        { type: String, trim: true, lowercase: true },
  description: { type: String, trim: true },

  // Identification
  sku:     { type: String, trim: true, uppercase: true },
  barcode: { type: String, trim: true },
  hsnCode: { type: String, trim: true },

  // Categorization
  categoryId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true },
  subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master' },
  brandId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true },
  unitId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Master' },
  departmentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true },

  // Pricing & Tax
  purchasePrice:   { type: Number, default: 0, min: 0 },
  sellingPrice:    { type: Number, required: [true, 'Selling price is required'], min: 0 },
  mrp:             { type: Number, min: 0 },
  discountedPrice: { type: Number, min: 0 },
  taxRate:         { type: Number, default: 0, min: 0 },
  isTaxInclusive:  { type: Boolean, default: false },

  // Inventory & Logistics
  inventory: [inventorySchema],
  dimensions: {
    length: { type: Number, min: 0 },
    width:  { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    weight: { type: Number, min: 0 },
  },

  // Media
  images:      [{ type: String }],
  imageAssets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],

  defaultSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  tags: [{ type: String, trim: true }],

  isActive:  { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  lastSold:  { type: Date },

}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
productSchema.index(
  { organizationId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $gt: '' } } }
);
productSchema.index(
  { organizationId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $gt: '' } } }
);
productSchema.index({ organizationId: 1, name: 'text', sku: 'text', barcode: 'text' });
// FIX #1 — Added isActive/isDeleted index for the most common product list query
productSchema.index({ organizationId: 1, isActive: 1, isDeleted: 1 });

// ─────────────────────────────────────────────
//  Virtuals
// ─────────────────────────────────────────────
productSchema.virtual('totalStock').get(function () {
  return this.inventory?.reduce((acc, i) => acc + i.quantity, 0) || 0;
});

// ─────────────────────────────────────────────
//  Pre-Save Middleware
// ─────────────────────────────────────────────
productSchema.pre('save', function (next) {
  // Auto-generate slug on name change
  if (this.isModified('name') && !this.slug) {
    this.slug = `${slugify(this.name)}-${nanoid(6)}`;
  }

  // FIX #2 — Guard: discountedPrice should never exceed sellingPrice
  if (this.discountedPrice !== undefined && this.discountedPrice > this.sellingPrice) {
    return next(new Error('discountedPrice cannot be greater than sellingPrice'));
  }

  // FIX #3 — Guard: mrp should not be less than sellingPrice (business rule)
  if (this.mrp !== undefined && this.mrp < this.sellingPrice) {
    return next(new Error('MRP cannot be less than sellingPrice'));
  }

  next();
});

// ─────────────────────────────────────────────
//  Post-Save: Cache Invalidation
// ─────────────────────────────────────────────
productSchema.post('save', async function (doc) {
  try {
    // FIX #4 — The original post-save hook had a comment placeholder with no actual logic.
    // This was a silent no-op in production, giving false confidence that cache was being cleared.
    // Fix: Added actual Redis cache invalidation using SCAN + DEL pattern.
    // Requires redis client to be imported. If redis is not available, fails silently (safe).
    const redis = require('../../../../config/redis');
    if (redis && redis.status === 'ready') {
      const pattern = `product:${doc.organizationId}:*`;
      // Use SCAN to find matching keys (KEYS is blocking and should not be used in production)
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    }
  } catch (err) {
    // Cache errors must never crash the main application flow
    console.error('[Product Cache Invalidation Error]', err.message);
  }
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
