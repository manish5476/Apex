const mongoose = require('mongoose');
const slug = require('mongoose-slug-generator');

// Initialize the plugin
mongoose.plugin(slug);

// --- Subdocument for Branch-Specific Inventory ---
const inventorySchema = new mongoose.Schema({
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    // You could add branch-specific reorder-levels here
    reorderLevel: {
        type: Number,
        default: 10,
    }
});

// --- Main Product Schema ---
const productSchema = new mongoose.Schema({
    // --- Core Links ---
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    
    // --- Basic Details ---
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
    },
    slug: { 
        type: String, 
        slug: 'name', // Auto-generates from 'name'
        unique: true, // Slug must be unique
    },
    description: {
        type: String,
        trim: true,
    },
    sku: { // Stock Keeping Unit
        type: String,
        trim: true,
        uppercase: true,
    },
    
    // --- Categorization ---
    brand: {
        type: String,
        trim: true,
    },
    category: {
        type: String,
        trim: true,
        index: true,
    },
    subCategory: {
        type: String,
        trim: true,
    },

    // --- Pricing ---
    purchasePrice: { // What the organization paid for it
        type: Number,
        default: 0,
    },
    sellingPrice: { // What the organization sells it for (MRP)
        type: Number,
        required: [true, 'Selling price is required'],
    },
    discountedPrice: { // Optional sale price
        type: Number,
    },
    taxRate: { // e.g., 18 for 18% GST
        type: Number,
        default: 0,
    },
    isTaxInclusive: { // Is the sellingPrice inclusive of tax?
        type: Boolean,
        default: false,
    },

    // --- Inventory ---
    inventory: [inventorySchema], // Tracks stock per branch
    
    // --- Media ---
    images: [{
        type: String, // Array of URLs
        trim: true,
    }],
    
    // --- Supplier (Dealer) ---
    defaultSupplierId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier', // We will create this model next
    },

    // --- Meta ---
    tags: [{ type: String, trim: true }],
    isActive: { // Is this product available for sale?
        type: Boolean,
        default: true,
    },
    
}, { 
    timestamps: true,
    toJSON: { virtuals: true }, // Ensure virtuals are included in JSON
    toObject: { virtuals: true } // Ensure virtuals are included in objects
});

// --- Virtual Field: Total Stock ---
// Calculates the total stock by summing up all branch quantities
productSchema.virtual('totalStock').get(function() {
    if (this.inventory && this.inventory.length > 0) {
        return this.inventory.reduce((acc, branch) => acc + branch.quantity, 0);
    }
    return 0;
});

// --- Compound Index ---
// Ensures that a SKU is unique *within* an organization,
// but two different organizations can have the same SKU.
productSchema.index({ organizationId: 1, sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: "string" } } });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;