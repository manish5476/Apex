// src/services/storefront/ruleQueryBuilder.service.js

const { SMART_RULE_TYPES } = require('../../utils/constants/sectionTypes.constants');
const AppError = require('../../../core/utils/appError');

class RuleQueryBuilder {
  build(rule, organizationId) {
    if (!rule || !organizationId) {
      throw new AppError('Invalid rule or organization', 400);
    }

    const match = {
      organizationId,
      isActive: true
    };

    const pipeline = [];

    switch (rule.ruleType) {
      case SMART_RULE_TYPES.NEW_ARRIVALS:
        this.newArrivals(match, rule);
        break;

      case SMART_RULE_TYPES.BEST_SELLERS:
        this.bestSellers(match, rule);
        break;

      case SMART_RULE_TYPES.CLEARANCE_SALE:
        pipeline.push(...this.clearanceSale());
        break;

      case SMART_RULE_TYPES.TRENDING:
        this.trending(match);
        break;

      case SMART_RULE_TYPES.CATEGORY_BASED:
        this.categoryBased(match, rule);
        break;

      case SMART_RULE_TYPES.LOW_STOCK:
        this.lowStock(match, rule);
        break;

      case SMART_RULE_TYPES.PRICE_RANGE:
        this.priceRange(match, rule);
        break;

      case SMART_RULE_TYPES.CUSTOM_QUERY:
        this.applyFilters(match, rule.filters);
        break;

      default:
        break;
    }

    this.applyFilters(match, rule.filters);

    return {
      pipeline: pipeline.length
        ? [{ $match: match }, ...pipeline]
        : [{ $match: match }],
      sort: this.buildSort(rule),
      limit: Math.min(rule.limit || 10, 50)
    };
  }

  buildSort(rule) {
    return {
      [rule.sortBy || 'createdAt']: rule.sortOrder === 'asc' ? 1 : -1
    };
  }

  newArrivals(match, rule) {
    const days = this.getDays(rule.filters, 'createdAt') || 30;
    const date = new Date();
    date.setDate(date.getDate() - days);
    match.createdAt = { $gte: date };
  }

  bestSellers(match, rule) {
    const days = this.getDays(rule.filters, 'lastSold') || 90;
    const date = new Date();
    date.setDate(date.getDate() - days);
    match.lastSold = { $gte: date };
  }

  trending(match) {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    match.lastSold = { $gte: date };
  }

  categoryBased(match, rule) {
    const category = this.getFilter(rule.filters, 'category');
    if (!category) {
      throw new AppError('Category filter required', 400);
    }
    match.category = category;
  }

  lowStock(match, rule) {
    const threshold = this.getFilter(rule.filters, 'quantity') || 10;
    match.inventory = {
      $elemMatch: { quantity: { $lte: threshold } }
    };
  }

  priceRange(match, rule) {
    const min = this.getFilter(rule.filters, 'price_min') || 0;
    const max = this.getFilter(rule.filters, 'price_max') || 999999;
    match.sellingPrice = { $gte: min, $lte: max };
  }

  clearanceSale() {
    return [
      {
        $addFields: {
          discountPercent: {
            $multiply: [
              {
                $divide: [
                  { $subtract: ['$sellingPrice', '$discountedPrice'] },
                  '$sellingPrice'
                ]
              },
              100
            ]
          }
        }
      },
      {
        $match: { discountPercent: { $gte: 10 } }
      },
      {
        $sort: { discountPercent: -1 }
      }
    ];
  }

  applyFilters(match, filters = []) {
    filters.forEach(f => {
      if (!f.field || !f.operator) return;

      switch (f.operator) {
        case 'equals':
          match[f.field] = f.value;
          break;
        case 'greater_than':
          match[f.field] = { $gt: f.value };
          break;
        case 'less_than':
          match[f.field] = { $lt: f.value };
          break;
        case 'in':
          match[f.field] = { $in: Array.isArray(f.value) ? f.value : [f.value] };
          break;
      }
    });
  }

  getFilter(filters, field) {
    return filters?.find(f => f.field === field)?.value;
  }

  getDays(filters, field) {
    const val = this.getFilter(filters, field);
    if (typeof val === 'string' && val.endsWith('d')) {
      return parseInt(val);
    }
    return null;
  }
}

module.exports = new RuleQueryBuilder();
