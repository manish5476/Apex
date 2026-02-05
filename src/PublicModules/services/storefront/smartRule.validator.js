const AppError = require('../../../core/utils/appError');

const RULE_FILTER_MATRIX = {
  new_arrivals: ['createdAt', 'tags'],
  best_sellers: ['lastSold', 'tags'],
  trending: ['lastSold', 'tags'],
  clearance_sale: ['price'],
  category_based: ['category'],
  price_range: ['price'],
  low_stock: ['stock'],
  custom_query: ['category', 'brand', 'price', 'stock', 'tags', 'createdAt', 'lastSold']
};

const REQUIRED_FILTERS = {
  category_based: ['category'],
  price_range: ['price']
};

function validateSmartRule(rule) {
  if (!rule) {
    throw new AppError('SmartRule payload missing', 400);
  }

  const allowedFields = RULE_FILTER_MATRIX[rule.ruleType];
  if (!allowedFields) {
    throw new AppError(`Unsupported rule type: ${rule.ruleType}`, 400);
  }

  const filters = rule.filters || [];

  // 1️⃣ Disallowed filters
  filters.forEach(f => {
    if (!allowedFields.includes(f.field)) {
      throw new AppError(
        `Filter '${f.field}' not allowed for rule type '${rule.ruleType}'`,
        400
      );
    }
  });

  // 2️⃣ Required filters
  const required = REQUIRED_FILTERS[rule.ruleType] || [];
  required.forEach(field => {
    const exists = filters.some(f => f.field === field);
    if (!exists) {
      throw new AppError(
        `Rule type '${rule.ruleType}' requires '${field}' filter`,
        400
      );
    }
  });

  // 3️⃣ Operator sanity
  filters.forEach(f => {
    if (f.operator === 'between' && (f.value2 === undefined || f.value2 === null)) {
      throw new AppError(`'between' operator requires value2`, 400);
    }
  });

  return true;
}

module.exports = { validateSmartRule };
