const mongoose = require("mongoose");
const { nanoid } = require("nanoid");

// Helper to create URL-friendly slugs
const slugify = (text) => text.toString().toLowerCase()
  .replace(/\s+/g, '-')           // Replace spaces with -
  .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
  .replace(/\-\-+/g, '-')         // Replace multiple - with single -
  .replace(/^-+/, '')             // Trim - from start of text
  .replace(/-+$/, '');            // Trim - from end of text

const masterSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    type: { type: String, required: true, trim: true, lowercase: true, index: true },    
    name: { type: String, required: true, trim: true },
    slug: { type: String, lowercase: true, trim: true, index: true },
    code: { type: String, trim: true, uppercase: true },
    description: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    
    // ✅ NEW: Parent for sub-categories (Electronics -> Mobile Phones)
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Master", default: null },

    isActive: { type: Boolean, default: true },
    
    // ✅ NEW: Metadata for sorting/featuring in UI
    metadata: {
        isFeatured: { type: Boolean, default: false },
        sortOrder: { type: Number, default: 0 }
    }
}, { timestamps: true });

// Auto-generate slug before saving
masterSchema.pre('save', function(next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = `${slugify(this.name)}-${nanoid(6)}`;
    }
    next();
});

// Compound index for uniqueness
masterSchema.index({ organizationId: 1, type: 1, name: 1 }, { unique: true });
masterSchema.index({ organizationId: 1, type: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model("Master", masterSchema);