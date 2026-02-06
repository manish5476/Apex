// src/models/storefront/smartRule.model.js
const mongoose = require('mongoose');

const filterSchema = new mongoose.Schema({
  field: { 
    type: String, 
    required: true, 
    enum: ['category', 'brand', 'price', 'tags', 'stock', 'createdAt', 'lastSold', 'discount'] 
  },
  operator: { 
    type: String, 
    required: true, 
    enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'between', 'in'] 
  },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  value2: { type: mongoose.Schema.Types.Mixed } // For 'between' operator
}, { _id: false });

const smartRuleSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true },
  
  ruleType: {
    type: String,
    required: true,
    enum: [
      'new_arrivals', 
      'best_sellers', 
      'clearance_sale', 
      'trending', 
      'seasonal', 
      'price_range', 
      'category_based', 
      'low_stock', 
      'custom_query'
    ]
  },
  
  // Query Construction
  filters: [filterSchema],
  sortBy: { 
    type: String, 
    enum: ['createdAt', 'sellingPrice', 'name', 'lastSold', 'views'], 
    default: 'createdAt' 
  },
  sortOrder: { type: String, enum: ['asc', 'desc'], default: 'desc' },
  limit: { type: Number, min: 1, max: 100, default: 12 },
  
  // Caching Strategy (Redis)
  cacheDuration: { type: Number, default: 15 }, // Minutes
  isActive: { type: Boolean, default: true, index: true },
  
  // Analytics
  lastExecutedAt: Date,
  executionCount: { type: Number, default: 0 }
}, {
  timestamps: true
});

smartRuleSchema.index({ organizationId: 1, ruleType: 1 });

module.exports = mongoose.model('SmartRule', smartRuleSchema);