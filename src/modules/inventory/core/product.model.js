const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const redis = require('../../../core/utils/_legacy/redis');

// ======================================================
// 📦 INVENTORY SUB-SCHEMA
// ======================================================
const inventorySchema = new mongoose.Schema({
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    quantity: { type: Number, required: true, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 10 }
}, { _id: false });

// ======================================================
// 🔤 SLUG UTILITY
// ======================================================
const slugify = (value) => { return value.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
// ======================================================
// 🛒 PRODUCT SCHEMA
// ======================================================

const productSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true, },
    name: { type: String, required: [true, 'Product name is required'], trim: true, },
    slug: { type: String, trim: true, lowercase: true, },
    description: { type: String, trim: true, },
    sku: { type: String, trim: true, uppercase: true, },
    // ======================================================
    // 🔗 MASTER REFERENCES (CRITICAL CHANGE)
    // ======================================================

    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true, },
    subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true, },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true, },
    // ======================================================
    // 💰 PRICING
    // ======================================================
    purchasePrice: { type: Number, default: 0, },
    sellingPrice: { type: Number, required: [true, 'Selling price is required'], },
    discountedPrice: { type: Number, },
    taxRate: { type: Number, default: 0, },
    isTaxInclusive: { type: Boolean, default: false, },

    // ======================================================
    // 📦 INVENTORY & MEDIA
    // ======================================================
    inventory: [inventorySchema],

    images: [{ type: String, trim: true, }],

    defaultSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', },

    tags: [{ type: String, trim: true, }],

    isActive: { type: Boolean, default: true, },

    // Analytics
    lastSold: { type: Date, }

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// ======================================================
// 🔑 INDEXES
// ======================================================
productSchema.index(
    { organizationId: 1, slug: 1 },
    { unique: true, partialFilterExpression: { slug: { $gt: '' } } }
);

productSchema.index(
    { organizationId: 1, sku: 1 },
    { unique: true, partialFilterExpression: { sku: { $gt: '' } } }
);

// ======================================================
// 📊 VIRTUALS
// ======================================================
productSchema.virtual('totalStock').get(function () {
    return this.inventory?.reduce((acc, i) => acc + i.quantity, 0) || 0;
});
// ======================================================
// 🧹 MIDDLEWARE
// ======================================================
productSchema.pre('save', function (next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = `${slugify(this.name)}-${nanoid(6)}`;
    }
    next();
});

// ======================================================
// 🧹 CACHE INVALIDATION
// ======================================================
productSchema.post('save', async function (doc) {
    try {
        if (redis && redis.status === 'ready') {
            const pattern = `smartrule:v1:${doc.organizationId}:*`;
            const keys = await redis.keys(pattern);

            if (keys.length) {
                await redis.del(keys);
                console.log(`[Cache] Cleared ${keys.length} smart rules for org ${doc.organizationId}`);
            }
        }
    } catch (err) {
        console.error('[Cache Error]', err);
    }
});
// ======================================================
// 🔄 AUTO-POPULATE MIDDLEWARE
// ======================================================
// This hook runs before any 'find', 'findOne', 'findById', etc.
productSchema.pre(/^find/, function (next) {
    this.populate({
        path: 'categoryId subCategoryId brandId unitId departmentId',
        select: 'name type code imageUrl' // We only pick fields we need from Master to keep it fast
    });

    // Also populate supplier if you need it
    this.populate({
        path: 'defaultSupplierId',
        select: 'companyName contactPerson'
    });

    next();
});
const Product = mongoose.model('Product', productSchema);
module.exports = Product;
