// src/models/storefront/smartRule.model.js
const mongoose = require('mongoose');

const filterSchema = new mongoose.Schema({
  field: { 
    type: String, 
    required: true, 
    enum: ['category', 'brand', 'price', 'tags', 'stock', 'createdAt', 'sellingPrice', 'discount'] 
  },
  operator: { 
    type: String, 
    required: true, 
    enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'between', 'in'] 
  },
  value: mongoose.Schema.Types.Mixed,
  value2: mongoose.Schema.Types.Mixed // For 'between'
}, { _id: false });

const smartRuleSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },

  ruleType: { 
    type: String, 
    required: true,
    enum: ['new_arrivals', 'best_sellers', 'clearance', 'trending', 'custom_query', 'stock_clearing']
  },

  // The Query Logic
  filters: [filterSchema],
  
  // Sorting
  sortBy: { type: String, default: 'createdAt' },
  sortOrder: { type: String, enum: ['asc', 'desc'], default: 'desc' },

  // ✅ PRO FEATURE: Merchandising
  // Always show these products at the top, regardless of filters
  pinnedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  // Never show these products in this rule
  excludedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

  // Limits
  limit: { type: Number, default: 12, max: 100 },
  
  // Cache Settings
  cacheDuration: { type: Number, default: 15 }, // Minutes

  // Schedule (Optional but kept for flexibility)
  schedule: {
    startDate: Date,
    endDate: Date
  },

  isActive: { type: Boolean, default: true }

}, { timestamps: true });

module.exports = mongoose.model('SmartRule', smartRuleSchema);

// // src/models/storefront/smartRule.model.js
// const mongoose = require('mongoose');

// const filterSchema = new mongoose.Schema({
//   field: { 
//     type: String, 
//     required: true, 
//     enum: ['category', 'brand', 'price', 'tags', 'stock', 'createdAt', 'sellingPrice', 'discount'] 
//   },
//   operator: { 
//     type: String, 
//     required: true, 
//     enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'between', 'in'] 
//   },
//   value: mongoose.Schema.Types.Mixed,
//   value2: mongoose.Schema.Types.Mixed // For 'between'
// }, { _id: false });

// const smartRuleSchema = new mongoose.Schema({
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
//   name: { type: String, required: true, trim: true },
//   ruleType: { 
//     type: String, 
//     required: true,
//     enum: ['new_arrivals', 'best_sellers', 'clearance', 'trending', 'custom_query', 'stock_clearing']
//   },

//   // The Query Logic
//   filters: [filterSchema],
  
//   // Sorting
//   sortBy: { type: String, default: 'createdAt' },
//   sortOrder: { type: String, enum: ['asc', 'desc'], default: 'desc' },

//   // ✅ PRO FEATURE: Merchandising
//   // Always show these products at the top, regardless of filters
//   pinnedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
//   // Never show these products in this rule
//   excludedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

//   // Limits & Performance
//   limit: { type: Number, default: 12, max: 100 },
//   cacheDuration: { type: Number, default: 15 }, // Minutes

//   isActive: { type: Boolean, default: true }

// }, { timestamps: true });

// module.exports = mongoose.model('SmartRule', smartRuleSchema);

// // // src/models/storefront/smartRule.model.js
// // const mongoose = require('mongoose');

// // const filterSchema = new mongoose.Schema({
// //   field: {
// //     type: String,
// //     required: true,
// //     enum: ['category', 'price', 'tags', 'stock', 'createdAt', 'lastSold']
// //   },
// //   operator: {
// //     type: String,
// //     required: true,
// //     enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'between', 'in', 'not_in']
// //   },
// //   value: {
// //     type: mongoose.Schema.Types.Mixed,
// //     required: true
// //   },
// //   value2: {
// //     type: mongoose.Schema.Types.Mixed  // For between operator
// //   }
// // }, { _id: false });

// // const smartRuleSchema = new mongoose.Schema({
// //   organizationId: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'Organization',
// //     required: true,
// //     index: true
// //   },
  
// //   name: {
// //     type: String,
// //     required: [true, 'Rule name is required'],
// //     trim: true,
// //     maxlength: [100, 'Rule name cannot exceed 100 characters']
// //   },
  
// //   description: {
// //     type: String,
// //     trim: true,
// //     maxlength: [500, 'Description cannot exceed 500 characters']
// //   },
  
// //   ruleType: {
// //     type: String,
// //     required: true,
// //     enum: [
// //       'new_arrivals',
// //       'best_sellers',
// //       'clearance_sale',
// //       'trending',
// //       'seasonal',
// //       'price_range',
// //       'category_based',
// //       'low_stock',
// //       'high_margin',
// //       'custom_query'
// //     ]
// //   },
  
// //   // Filters
// //   filters: [filterSchema],
  
// //   // Sorting
// //   sortBy: {
// //     type: String,
// //     enum: ['createdAt', 'sellingPrice', 'discountedPrice', 'name', 'lastSold', 'views', 'salesCount'],
// //     default: 'createdAt'
// //   },
// //   sortOrder: {
// //     type: String,
// //     enum: ['asc', 'desc'],
// //     default: 'desc'
// //   },
  
// //   // Limits
// //   limit: {
// //     type: Number,
// //     min: 1,
// //     max: 100,
// //     default: 10
// //   },
// //   skip: {
// //     type: Number,
// //     min: 0,
// //     default: 0
// //   },
  
// //   // Schedule (for seasonal rules)
// //   schedule: {
// //     startDate: Date,
// //     endDate: Date,
// //     recurrence: {
// //       type: String,
// //       enum: ['none', 'daily', 'weekly', 'monthly', 'yearly']
// //     }
// //   },
  
// //   // Performance tracking
// //   lastExecutedAt: Date,
// //   executionCount: {
// //     type: Number,
// //     default: 0
// //   },
  
// //   // Status
// //   isActive: {
// //     type: Boolean,
// //     default: true,
// //     index: true
// //   },
  
// //   // Metadata
// //   tags: [{
// //     type: String,
// //     trim: true
// //   }],
  
// //   // Result caching
// //   cacheDuration: {
// //     type: Number,  // in minutes
// //     default: 15
// //   },
// //   lastCachedAt: Date,
// //   cachedResultIds: [{
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'Product'
// //   }]
// // }, {
// //   timestamps: true
// // });

// // // Indexes
// // smartRuleSchema.index({ organizationId: 1, ruleType: 1 });
// // smartRuleSchema.index({ organizationId: 1, isActive: 1 });
// // smartRuleSchema.index({ 'schedule.startDate': 1, 'schedule.endDate': 1 });

// // module.exports = mongoose.model('SmartRule', smartRuleSchema);