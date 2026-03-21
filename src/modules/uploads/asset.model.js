const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true, 
    index: true 
  },
  uploadedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  fileName: { type: String, required: true, trim: true },
  originalName: { type: String },
  mimeType: { type: String },
  size: { type: Number }, // Size in bytes
  
  // Cloudinary specific
  publicId: { type: String, required: true }, 
  url: { type: String, required: true },
  
  category: { 
    type: String, 
    enum: ['product', 'avatar', 'invoice', 'chat', 'marketing'], 
    default: 'marketing' 
  },
  
  // For future local storage migration
  provider: { 
    type: String, 
    enum: ['cloudinary', 'local'], 
    default: 'cloudinary' 
  }
}, { timestamps: true });

// Index for high-performance search
assetSchema.index({ organizationId: 1, fileName: 'text' });

module.exports = mongoose.model('Asset', assetSchema);