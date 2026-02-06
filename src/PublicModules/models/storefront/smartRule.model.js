const mongoose = require('mongoose');

/**
 * Filter Schema: Atomic condition for product selection.
 */
const filterSchema = new mongoose.Schema({
    field: { 
        type: String, 
        required: [true, 'Filter field is required'], 
        enum: {
            values: ['category', 'brand', 'price', 'tags', 'stock', 'createdAt', 'lastSold', 'discountPercent'],
            message: '{VALUE} is not a supported filter field'
        }
    },
    operator: { 
        type: String, 
        required: [true, 'Filter operator is required'], 
        enum: {
            values: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'between', 'in', 'not_in'],
            message: '{VALUE} is not a supported operator'
        }
    },
    value: { type: mongoose.Schema.Types.Mixed, required: [true, 'Filter value is required'] },
    value2: { type: mongoose.Schema.Types.Mixed }, // Required ONLY for 'between' operator
    isDynamic: { type: Boolean, default: false } // For contextual rules like "related to current"
}, { _id: false });

/**
 * SmartRule Model
 * Defines the logic for automated product collections (Best Sellers, New Arrivals, etc.)
 */
const smartRuleSchema = new mongoose.Schema({
    organizationId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Organization', 
        required: [true, 'Organization ID is required'], 
        index: true 
    },
    name: { 
        type: String, 
        required: [true, 'Rule name is required'], 
        trim: true, 
        maxlength: [100, 'Rule name cannot exceed 100 characters'] 
    },
    description: { 
        type: String, 
        trim: true, 
        maxlength: [500, 'Description cannot exceed 500 characters'] 
    },

    // Primary Logic Category
    ruleType: { 
        type: String, 
        required: [true, 'Rule type is required'], 
        enum: {
            values: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending', 'category_based', 'price_range', 'custom_query'],
            message: '{VALUE} is not a valid rule type'
        }
    },

    // The Logic Engine Payload
    filters: [filterSchema],
    
    // Sorting Configuration
    sortBy: { 
        type: String, 
        default: 'createdAt',
        enum: ['createdAt', 'sellingPrice', 'salesCount', 'lastSold', 'name', 'discountPercent']
    },
    sortOrder: { 
        type: String, 
        enum: ['asc', 'desc'], 
        default: 'desc' 
    },
    
    // Performance Constraints
    limit: { 
        type: Number, 
        default: 12, 
        min: [1, 'Limit must be at least 1'], 
        max: [100, 'Limit cannot exceed 100 for performance reasons'] 
    },
    
    // Status & Caching
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    cacheDuration: { 
        type: Number, 
        default: 15, 
        min: [5, 'Minimum cache duration is 5 minutes'], 
        max: [1440, 'Maximum cache duration is 24 hours'] 
    }, 
    
    // Analytics & Monitoring
    executionStats: {
        count: { type: Number, default: 0 },
        lastExecutedAt: { type: Date },
        averageExecutionTimeMs: { type: Number, default: 0 }
    },

    // Audit Trail
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// --- PERFORMANCE INDEXING ---
// Compound index for fast filtering of active rules within an organization
smartRuleSchema.index({ organizationId: 1, isActive: 1, isDeleted: 1 });
// Index for rule name searching
smartRuleSchema.index({ name: 'text' });

/**
 * Middleware: Business Logic Validation
 */
smartRuleSchema.pre('save', function (next) {
    // 1. Validate 'between' operator requirements
    if (this.filters && this.filters.length > 0) {
        for (const filter of this.filters) {
            if (filter.operator === 'between' && (filter.value2 === undefined || filter.value2 === null)) {
                return next(new Error(`Filter for '${filter.field}' with 'between' operator requires a second value (value2)`));
            }
        }
    }
    next();
});

/**
 * Middleware: Soft Delete Filter
 * Automatically excludes deleted rules from standard 'find' queries
 */
smartRuleSchema.pre(/^find/, function(next) {
    this.where({ isDeleted: { $ne: true } });
    next();
});

module.exports = mongoose.model('SmartRule', smartRuleSchema);

// const mongoose = require('mongoose');
// const filterSchema = new mongoose.Schema({
//   field: { type: String, required: true, enum: ['category', 'price', 'tags', 'stock', 'createdAt', 'lastSold'] },
//   operator: { type: String, required: true, enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'between', 'in', 'not_in'] },
//   value: { type: mongoose.Schema.Types.Mixed, required: true },
//   value2: { type: mongoose.Schema.Types.Mixed }
// }, { _id: false });

// const smartRuleSchema = new mongoose.Schema({
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   name: { type: String, required: [true, 'Rule name is required'], trim: true, maxlength: [100, 'Rule name cannot exceed 100 characters'] },
//   description: { type: String, trim: true, maxlength: [500, 'Description cannot exceed 500 characters'] },
//   ruleType: { type: String, required: true, enum: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending', 'seasonal', 'price_range', 'category_based', 'low_stock', 'high_margin', 'custom_query'] },
//   filters: [filterSchema],
//   sortBy: { type: String, enum: ['createdAt', 'sellingPrice', 'discountedPrice', 'name', 'lastSold', 'views', 'salesCount'], default: 'createdAt' },
//   sortOrder: { type: String, enum: ['asc', 'desc'], default: 'desc' },
//   limit: { type: Number, min: 1, max: 100, default: 10 },
//   skip: { type: Number, min: 0, default: 0 },
//   schedule: {
//     startDate: Date, endDate: Date, recurrence: { type: String, enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'] }
//   },
//   lastExecutedAt: Date,
//   executionCount: { type: Number, default: 0 },
//   isActive: { type: Boolean, default: true, index: true },
//   tags: [{ type: String, trim: true }],
//   cacheDuration: { type: Number, default: 15 },
//   lastCachedAt: Date,
//   cachedResultIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
// }, {
//   timestamps: true
// });
// smartRuleSchema.index({ organizationId: 1, ruleType: 1 });
// smartRuleSchema.index({ organizationId: 1, isActive: 1 });
// smartRuleSchema.index({ 'schedule.startDate': 1, 'schedule.endDate': 1 });

// module.exports = mongoose.model('SmartRule', smartRuleSchema);
