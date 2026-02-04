
const mongoose = require('mongoose');
const filterSchema = new mongoose.Schema({
  field: { type: String, required: true, enum: ['category', 'price', 'tags', 'stock', 'createdAt', 'lastSold'] },
  operator: { type: String, required: true, enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'between', 'in', 'not_in'] },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  value2: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const smartRuleSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: [true, 'Rule name is required'], trim: true, maxlength: [100, 'Rule name cannot exceed 100 characters'] },
  description: { type: String, trim: true, maxlength: [500, 'Description cannot exceed 500 characters'] },
  ruleType: { type: String, required: true, enum: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending', 'seasonal', 'price_range', 'category_based', 'low_stock', 'high_margin', 'custom_query'] },
  filters: [filterSchema],
  sortBy: { type: String, enum: ['createdAt', 'sellingPrice', 'discountedPrice', 'name', 'lastSold', 'views', 'salesCount'], default: 'createdAt' },
  sortOrder: { type: String, enum: ['asc', 'desc'], default: 'desc' },
  limit: { type: Number, min: 1, max: 100, default: 10 },
  skip: { type: Number, min: 0, default: 0 },
  schedule: {
    startDate: Date, endDate: Date, recurrence: { type: String, enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'] }
  },
  lastExecutedAt: Date,
  executionCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  tags: [{ type: String, trim: true }],
  cacheDuration: { type: Number, default: 15 },
  lastCachedAt: Date,
  cachedResultIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
}, {
  timestamps: true
});
smartRuleSchema.index({ organizationId: 1, ruleType: 1 });
smartRuleSchema.index({ organizationId: 1, isActive: 1 });
smartRuleSchema.index({ 'schedule.startDate': 1, 'schedule.endDate': 1 });

module.exports = mongoose.model('SmartRule', smartRuleSchema);