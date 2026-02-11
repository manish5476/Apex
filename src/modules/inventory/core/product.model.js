const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const redis = require('../../../core/utils/_legacy/redis');

// Sub-schema for Branch Inventory
const inventorySchema = new mongoose.Schema({
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    quantity: { type: Number, required: true, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 10 },
    rackLocation: { type: String, trim: true } // e.g., "A1-Row2"
}, { _id: false });

const slugify = (value) => { 
    return value.toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, ''); 
};

const productSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    
    // --- Basic Info ---
    name: { type: String, required: [true, 'Product name is required'], trim: true },
    slug: { type: String, trim: true, lowercase: true },
    description: { type: String, trim: true },
    
    // --- Identification ---
    sku: { type: String, trim: true, uppercase: true }, // Internal ID (e.g. LEN-YOGA-01)
    barcode: { type: String, trim: true }, // Scan Code (e.g. 890123456789)
    hsnCode: { type: String, trim: true }, // 🟢 CRITICAL FOR GST
    
    // --- Categorization ---
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true },
    subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master' },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master' }, // e.g. "Pcs", "Kg"
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true },

    // --- Pricing & Tax ---
    purchasePrice: { type: Number, default: 0 },
    sellingPrice: { type: Number, required: [true, 'Selling price is required'] },
    mrp: { type: Number }, // Maximum Retail Price (often different from selling price)
    discountedPrice: { type: Number },
    
    taxRate: { type: Number, default: 0 }, // e.g. 18 for 18% GST
    isTaxInclusive: { type: Boolean, default: false },

    // --- Inventory & Logistics ---
    inventory: [inventorySchema],
    dimensions: {
        length: Number,
        width: Number,
        height: Number,
        weight: Number // in Kg
    },

    // --- Media & Meta ---
    images: [{ type: String, trim: true }],
    defaultSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    tags: [{ type: String, trim: true }],
    
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false }, // Soft Delete is better than hard delete
    lastSold: { type: Date }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// --- INDEXES ---
// Ensure SKU is unique per Organization
productSchema.index({ organizationId: 1, sku: 1 }, { unique: true, partialFilterExpression: { sku: { $gt: '' } } });
// Ensure Barcode is unique per Organization
productSchema.index({ organizationId: 1, barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $gt: '' } } });
// Fast Search Index
productSchema.index({ organizationId: 1, name: 'text', sku: 'text', barcode: 'text' });

// --- VIRTUALS ---
productSchema.virtual('totalStock').get(function () { 
    return this.inventory?.reduce((acc, i) => acc + i.quantity, 0) || 0; 
});

// --- MIDDLEWARE ---
productSchema.pre('save', function (next) {
    if (this.isModified('name') && !this.slug) { 
        this.slug = `${slugify(this.name)}-${nanoid(6)}`; 
    }
    next();
});

// 🔴 REMOVED auto-populate 'pre find' hook for performance
// Instead, use .populate() in your controller when specifically needed.

productSchema.post('save', async function (doc) {
    try {
        if (redis && redis.status === 'ready') {
            // Clear lists and specific item caches
            const pattern = `product:${doc.organizationId}:*`;
            // Redis logic...
        }
    } catch (err) {
        console.error('[Cache Error]', err);
    }
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
// const mongoose = require('mongoose');
// const { nanoid } = require('nanoid');
// const redis = require('../../../core/utils/_legacy/redis');

// const inventorySchema = new mongoose.Schema({
//     branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
//     quantity: { type: Number, required: true, default: 0, min: 0 },
//     reorderLevel: { type: Number, default: 10 }
// }, { _id: false });
// const slugify = (value) => { return value.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
// const productSchema = new mongoose.Schema({
//     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true, },
//     name: { type: String, required: [true, 'Product name is required'], trim: true, },
//     slug: { type: String, trim: true, lowercase: true, },
//     description: { type: String, trim: true, },
//     sku: { type: String, trim: true, uppercase: true, },
//     categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true, },
//     subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', },
//     brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true, },
//     unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', },
//     departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true, },
//     purchasePrice: { type: Number, default: 0, },
//     sellingPrice: { type: Number, required: [true, 'Selling price is required'], },
//     discountedPrice: { type: Number, },
//     taxRate: { type: Number, default: 0, },
//     isTaxInclusive: { type: Boolean, default: false, },
//     inventory: [inventorySchema],
//     images: [{ type: String, trim: true, }],
//     defaultSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', },
//     tags: [{ type: String, trim: true, }],
//     isActive: { type: Boolean, default: true, },
//     lastSold: { type: Date, }
// }, {
//     timestamps: true,
//     toJSON: { virtuals: true },
//     toObject: { virtuals: true },
// });
// productSchema.index({ organizationId: 1, slug: 1 }, { unique: true, partialFilterExpression: { slug: { $gt: '' } } });
// productSchema.index({ organizationId: 1, sku: 1 }, { unique: true, partialFilterExpression: { sku: { $gt: '' } } });
// productSchema.virtual('totalStock').get(function () { return this.inventory?.reduce((acc, i) => acc + i.quantity, 0) || 0; });
// productSchema.pre('save', function (next) {
//     if (this.isModified('name') && !this.slug) { this.slug = `${slugify(this.name)}-${nanoid(6)}`; }
//     next();
// });

// productSchema.post('save', async function (doc) {
//     try {
//         if (redis && redis.status === 'ready') {
//             const pattern = `smartrule:v1:${doc.organizationId}:*`;
//             const keys = await redis.keys(pattern);
//             if (keys.length) {
//                 await redis.del(keys);
//                 console.log(`[Cache] Cleared ${keys.length} smart rules for org ${doc.organizationId}`);
//             }
//         }
//     } catch (err) {
//         console.error('[Cache Error]', err);
//     }
// });
// productSchema.pre(/^find/, function (next) {
//     this.populate({
//         path: 'categoryId subCategoryId brandId unitId departmentId',
//         select: 'name type code imageUrl' // We only pick fields we need from Master to keep it fast
//     });
//     this.populate({
//         path: 'defaultSupplierId',
//         select: 'companyName contactPerson'
//     });
//     next();
// });
// const Product = mongoose.model('Product', productSchema);
// module.exports = Product;
