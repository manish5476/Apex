/**
 * SmartRuleValidator
 *
 * Validates SmartRule payload objects before create/update.
 * Uses Set-based O(1) lookups for performance.
 *
 * Throws AppError on failure (controller catches and forwards to error handler).
 * Returns true on success.
 */

'use strict';

const AppError = require('../../../core/utils/api/appError');

// Fields allowed per rule type
const RULE_FILTER_MATRIX = {
  new_arrivals:    new Set(['createdAt', 'tags']),
  best_sellers:    new Set(['lastSold', 'tags', 'category', 'brand']),
  trending:        new Set(['lastSold', 'tags', 'category']),
  clearance_sale:  new Set(['price', 'tags', 'category', 'brand']),
  category_based:  new Set(['category', 'brand', 'price', 'tags', 'stock']),
  price_range:     new Set(['price', 'category', 'tags']),
  low_stock:       new Set(['stock', 'category', 'brand']),
  seasonal:        new Set(['tags', 'category', 'createdAt']),
  custom_query:    new Set(['category','brand','price','stock','tags','createdAt','lastSold','discount']),
  manual_selection:new Set([]) // No filters for manual
};

// Fields that MUST be present for certain rule types
const REQUIRED_FILTERS = {
  category_based: ['category'],
  price_range:    ['price']
};

const VALID_OPERATORS = new Set([
  'equals','not_equals','contains','greater_than','less_than','between','in'
]);

const VALID_SORT_FIELDS = new Set([
  'createdAt','sellingPrice','name','lastSold','views','salesCount'
]);

/**
 * Full validation of a SmartRule payload.
 * @param {Object} rule   Raw request body
 * @throws {AppError}
 */
function validateSmartRule(rule) {
  if (!rule || typeof rule !== 'object') {
    throw new AppError('SmartRule payload is missing or invalid', 400);
  }

  // 1. Rule type
  if (!rule.ruleType) {
    throw new AppError('ruleType is required', 400);
  }

  const allowedFields = RULE_FILTER_MATRIX[rule.ruleType];
  if (!allowedFields) {
    throw new AppError(
      `Unsupported ruleType: "${rule.ruleType}". Valid types: ${Object.keys(RULE_FILTER_MATRIX).join(', ')}`,
      400
    );
  }

  // 2. Name
  if (!rule.name || typeof rule.name !== 'string' || rule.name.trim().length === 0) {
    throw new AppError('Rule name is required', 400);
  }
  if (rule.name.length > 100) {
    throw new AppError('Rule name must be 100 characters or less', 400);
  }

  // 3. Limit
  if (rule.limit !== undefined) {
    const lim = Number(rule.limit);
    if (!Number.isInteger(lim) || lim < 1 || lim > 100) {
      throw new AppError('limit must be an integer between 1 and 100', 400);
    }
  }

  // 4. Sort
  if (rule.sortBy && !VALID_SORT_FIELDS.has(rule.sortBy)) {
    throw new AppError(
      `sortBy "${rule.sortBy}" is not valid. Options: ${[...VALID_SORT_FIELDS].join(', ')}`,
      400
    );
  }
  if (rule.sortOrder && !['asc','desc'].includes(rule.sortOrder)) {
    throw new AppError('sortOrder must be "asc" or "desc"', 400);
  }

  // 5. Manual selection: validate IDs present
  if (rule.ruleType === 'manual_selection') {
    if (!Array.isArray(rule.manualProductIds) || rule.manualProductIds.length === 0) {
      throw new AppError('manual_selection requires at least one product ID in manualProductIds', 400);
    }
    return true; // No filters to validate
  }

  // 6. Filters array
  const filters = rule.filters ?? [];
  if (!Array.isArray(filters)) {
    throw new AppError('filters must be an array', 400);
  }

  // Single pass: field allowed + operator sanity + value presence
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];

    if (!f || typeof f !== 'object') {
      throw new AppError(`Filter at index ${i} is invalid`, 400);
    }

    if (!f.field) {
      throw new AppError(`Filter at index ${i} is missing "field"`, 400);
    }
    if (!allowedFields.has(f.field)) {
      throw new AppError(
        `Filter field "${f.field}" is not allowed for ruleType "${rule.ruleType}". Allowed: ${[...allowedFields].join(', ')}`,
        400
      );
    }

    if (!f.operator) {
      throw new AppError(`Filter at index ${i} is missing "operator"`, 400);
    }
    if (!VALID_OPERATORS.has(f.operator)) {
      throw new AppError(
        `Filter operator "${f.operator}" is invalid. Valid: ${[...VALID_OPERATORS].join(', ')}`,
        400
      );
    }

    if (f.value === undefined || f.value === null || f.value === '') {
      throw new AppError(`Filter at index ${i} (field: "${f.field}") is missing "value"`, 400);
    }

    if (f.operator === 'between') {
      if (f.value2 === undefined || f.value2 === null || f.value2 === '') {
        throw new AppError(`Filter at index ${i} with operator "between" requires "value2"`, 400);
      }
      if (Number(f.value2) <= Number(f.value)) {
        throw new AppError(`Filter at index ${i}: value2 must be greater than value for "between" operator`, 400);
      }
    }
  }

  // 7. Required filters
  const requiredFields = REQUIRED_FILTERS[rule.ruleType];
  if (requiredFields) {
    for (const required of requiredFields) {
      if (!filters.some(f => f.field === required)) {
        throw new AppError(
          `ruleType "${rule.ruleType}" requires a filter for field "${required}"`,
          400
        );
      }
    }
  }

  return true;
}

module.exports = { validateSmartRule };


// const AppError = require('../../../core/utils/api/appError');

// // Optimization: Use Sets for O(1) lookup
// const RULE_FILTER_MATRIX = {
//   new_arrivals: new Set(['createdAt', 'tags']),
//   best_sellers: new Set(['lastSold', 'tags']),
//   trending: new Set(['lastSold', 'tags']),
//   clearance_sale: new Set(['price']),
//   category_based: new Set(['category']),
//   price_range: new Set(['price']),
//   low_stock: new Set(['stock']),
//   // Custom query allows almost everything
//   custom_query: new Set(['category', 'brand', 'price', 'stock', 'tags', 'createdAt', 'lastSold']),
//   // Optimization: Add manual_selection here to prevent crashes if validated
//   manual_selection: new Set([]) 
// };

// // Required filters per rule type
// const REQUIRED_FILTERS = {
//   category_based: ['category'],
//   price_range: ['price']
// };

// /**
//  * Validates a Smart Rule configuration object.
//  * Optimized for performance using Set lookups.
//  * @param {Object} rule - The rule object to validate
//  */
// function validateSmartRule(rule) {
//   // 1. Basic Payload Check
//   if (!rule) {
//     throw new AppError('SmartRule payload missing', 400);
//   }

//   // 2. Rule Type Validity
//   if (!rule.ruleType) {
//     throw new AppError('Rule type is required', 400);
//   }

//   const allowedFields = RULE_FILTER_MATRIX[rule.ruleType];
//   if (!allowedFields) {
//     throw new AppError(`Unsupported rule type: ${rule.ruleType}`, 400);
//   }

//   // Manual selection doesn't use filters, so we can skip the rest
//   if (rule.ruleType === 'manual_selection') {
//     return true; 
//   }

//   const filters = rule.filters || [];

//   // 3. Single Pass Validation Loop
//   // We iterate through filters once to check validity and operator sanity
//   for (const f of filters) {
//     // A. Field Allowed Check
//     if (!allowedFields.has(f.field)) {
//       throw new AppError(
//         `Filter '${f.field}' is not allowed for rule type '${rule.ruleType}'`,
//         400
//       );
//     }

//     // B. Operator Sanity Check
//     if (f.operator === 'between') {
//       if (f.value2 === undefined || f.value2 === null || f.value2 === '') {
//         throw new AppError(`Filter '${f.field}' with 'between' operator requires a second value (value2)`, 400);
//       }
//       // Optional: Check if value2 > value1 for range logic consistency?
//       // Leaving out for flexibility, but good to keep in mind.
//     }
//   }

//   // 4. Required Filter Check
//   // Only runs if the rule type has mandatory requirements
//   const required = REQUIRED_FILTERS[rule.ruleType];
//   if (required) {
//     for (const field of required) {
//       // Efficiently check if ANY filter matches the required field
//       const hasRequired = filters.some(f => f.field === field);
//       if (!hasRequired) {
//         throw new AppError(
//           `Rule type '${rule.ruleType}' requires the '${field}' filter to be set`,
//           400
//         );
//       }
//     }
//   }

//   return true;
// }

// module.exports = { validateSmartRule };