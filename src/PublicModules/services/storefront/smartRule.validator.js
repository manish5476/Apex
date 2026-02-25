const AppError = require('../../../core/utils/api/appError');

// Optimization: Use Sets for O(1) lookup
const RULE_FILTER_MATRIX = {
  new_arrivals: new Set(['createdAt', 'tags']),
  best_sellers: new Set(['lastSold', 'tags']),
  trending: new Set(['lastSold', 'tags']),
  clearance_sale: new Set(['price']),
  category_based: new Set(['category']),
  price_range: new Set(['price']),
  low_stock: new Set(['stock']),
  // Custom query allows almost everything
  custom_query: new Set(['category', 'brand', 'price', 'stock', 'tags', 'createdAt', 'lastSold']),
  // Optimization: Add manual_selection here to prevent crashes if validated
  manual_selection: new Set([]) 
};

// Required filters per rule type
const REQUIRED_FILTERS = {
  category_based: ['category'],
  price_range: ['price']
};

/**
 * Validates a Smart Rule configuration object.
 * Optimized for performance using Set lookups.
 * @param {Object} rule - The rule object to validate
 */
function validateSmartRule(rule) {
  // 1. Basic Payload Check
  if (!rule) {
    throw new AppError('SmartRule payload missing', 400);
  }

  // 2. Rule Type Validity
  if (!rule.ruleType) {
    throw new AppError('Rule type is required', 400);
  }

  const allowedFields = RULE_FILTER_MATRIX[rule.ruleType];
  if (!allowedFields) {
    throw new AppError(`Unsupported rule type: ${rule.ruleType}`, 400);
  }

  // Manual selection doesn't use filters, so we can skip the rest
  if (rule.ruleType === 'manual_selection') {
    return true; 
  }

  const filters = rule.filters || [];

  // 3. Single Pass Validation Loop
  // We iterate through filters once to check validity and operator sanity
  for (const f of filters) {
    // A. Field Allowed Check
    if (!allowedFields.has(f.field)) {
      throw new AppError(
        `Filter '${f.field}' is not allowed for rule type '${rule.ruleType}'`,
        400
      );
    }

    // B. Operator Sanity Check
    if (f.operator === 'between') {
      if (f.value2 === undefined || f.value2 === null || f.value2 === '') {
        throw new AppError(`Filter '${f.field}' with 'between' operator requires a second value (value2)`, 400);
      }
      // Optional: Check if value2 > value1 for range logic consistency?
      // Leaving out for flexibility, but good to keep in mind.
    }
  }

  // 4. Required Filter Check
  // Only runs if the rule type has mandatory requirements
  const required = REQUIRED_FILTERS[rule.ruleType];
  if (required) {
    for (const field of required) {
      // Efficiently check if ANY filter matches the required field
      const hasRequired = filters.some(f => f.field === field);
      if (!hasRequired) {
        throw new AppError(
          `Rule type '${rule.ruleType}' requires the '${field}' filter to be set`,
          400
        );
      }
    }
  }

  return true;
}

module.exports = { validateSmartRule };