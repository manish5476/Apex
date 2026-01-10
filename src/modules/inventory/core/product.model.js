const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const inventorySchema = new mongoose.Schema({
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    quantity: { type: Number, required: true, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 10 }
});

const slugify = (value) => {
    return value.toString().trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
};

const productSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
    },
    slug: {
        type: String,
        trim: true,
        lowercase: true
    },

    // Analytics Field (Controller updates this on sale)
    lastSold: { type: Date },

    description: { type: String, trim: true },
    sku: { type: String, trim: true, uppercase: true },
    brand: { type: String, trim: true },
    category: { type: String, trim: true, index: true },
    subCategory: { type: String, trim: true },
    purchasePrice: { type: Number, default: 0 },
    sellingPrice: { type: Number, required: [true, 'Selling price is required'] },
    discountedPrice: { type: Number },
    taxRate: { type: Number, default: 0 },
    isTaxInclusive: { type: Boolean, default: false },
    inventory: [inventorySchema],
    images: [{ type: String, trim: true }],
    defaultSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    tags: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ======================================================
// 🔑 INDEXES (The Critical Fix for Bulk/Factories)
// ======================================================

// We make the slug unique PER organization. 
// The partialFilterExpression ensures that if slug is missing (null/empty), 
// it doesn't trigger a duplicate error.
productSchema.index(
    { organizationId: 1, slug: 1 },
    {
        unique: true,
        partialFilterExpression: { slug: { $gt: "" } }
    }
);

productSchema.index(
    { organizationId: 1, sku: 1 },
    {
        unique: true,
        partialFilterExpression: { sku: { $gt: "" } }
    }
);

productSchema.virtual('totalStock').get(function () {
    return this.inventory?.reduce((acc, b) => acc + b.quantity, 0) || 0;
});

// ======================================================
// 🧹 MIDDLEWARE (For factory.createOne)
// ======================================================
productSchema.pre("save", async function (next) {
    // Only generate slug if name is modified AND slug doesn't exist
    if (this.isModified("name") && !this.slug) {
        this.slug = `${slugify(this.name)}-${nanoid(6)}`;
    }
    next();
});

const Product = mongoose.model("Product", productSchema);
module.exports = Product;
