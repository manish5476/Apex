// utils/ApiFeatures.js - ENTERPRISE-GRADE API FEATURES
const mongoose = require('mongoose');
const redis = require('../../_legacy/redis'); // Assume Redis client
const AppError = require('../appError');
// Create error classes based on AppError
class QueryError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
  }
}
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
  }
}
class RateLimitError extends AppError {
  constructor(message, details = null) {
    super(message, 429, details);
  }
}

/**
 * API Features - Enterprise Edition
 * Supports: Filtering, Sorting, Pagination, Search, Aggregation, Caching, Analytics
 */
class ApiFeatures {
  constructor(query, queryString, options = {}) {
    this.query = query;
    this.queryString = queryString || {};
    this.model = query.model || options.model;
    this.isAggregate = options.isAggregate || false;
    this.user = options.user || {};
    this.requestId = options.requestId;

    // Core state
    this.baseFilter = options.baseFilter || {};
    this.securityContext = options.securityContext || {};
    this.metadata = {
      startTime: Date.now(),
      queryCount: 0,
      cacheHit: false,
      fromCache: false
    };

    // Configuration
    this.config = {
      maxLimit: options.maxLimit || 1000,
      defaultLimit: options.defaultLimit || 50,
      maxOrClauses: options.maxOrClauses || 20,
      maxNestedDepth: options.maxNestedDepth || 3,
      enableCache: options.enableCache !== false,
      cacheTTL: options.cacheTTL || 300, // 5 minutes
      timeout: options.timeout || 30000, // 30 seconds
      allowedOperators: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'regex', 'exists'],
      ...options.config
    };

    // Performance tracking
    this.performance = {
      stages: [],
      documentsExamined: 0,
      indexesUsed: []
    };

    // Validation
    this.validateQuery();
  }

  /**
   * QUERY VALIDATION & SANITIZATION
   */
  validateQuery() {
    // Prevent NoSQL injection
    const sanitized = {};
    for (const key in this.queryString) {
      if (typeof this.queryString[key] === 'string') {
        // Remove dangerous operators
        const value = this.queryString[key]
          .replace(/\$where/g, '')
          .replace(/\$function/g, '')
          .replace(/\$expr/g, '');
        sanitized[key] = value;
      } else {
        sanitized[key] = this.queryString[key];
      }
    }
    this.queryString = sanitized;

    // Validate pagination limits
    const requestedLimit = parseInt(this.queryString.limit);
    if (requestedLimit && requestedLimit > this.config.maxLimit) {
      throw new ValidationError(
        `Limit cannot exceed ${this.config.maxLimit}`,
        { requested: requestedLimit, allowed: this.config.maxLimit }
      );
    }
  }

  /**
   * TYPE COERCION WITH SECURITY
   */
  static coerceValue(value, fieldType = null) {
    if (value === null || value === undefined) return value;

    // Handle ObjectId
    if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
      // Prevent ObjectId injection
      if (value.length !== 12 && value.length !== 24) return value;
      try {
        return new mongoose.Types.ObjectId(value);
      } catch {
        return value;
      }
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(v => ApiFeatures.coerceValue(v, fieldType));
    }

    // Handle objects (for nested queries)
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      const result = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = ApiFeatures.coerceValue(v, fieldType);
      }
      return result;
    }

    // Handle primitive types
    if (typeof value !== 'string') return value;

    // Type-specific coercion based on field schema
    if (fieldType) {
      switch (fieldType) {
        case 'Number':
          const num = Number(value);
          return isNaN(num) ? value : num;
        case 'Boolean':
          if (value.toLowerCase() === 'true') return true;
          if (value.toLowerCase() === 'false') return false;
          return value;
        case 'Date':
          const date = new Date(value);
          return isNaN(date.getTime()) ? value : date;
        default:
          return value;
      }
    }

    // Auto-detection (fallback)
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value) && value.trim() !== '') {
      const num = Number(value);
      return isNaN(num) ? value : num;
    }

    // Try date parsing
    const date = new Date(value);
    if (!isNaN(date)) return date;

    return value;
  }

  /**
   * GET FIELD TYPE FROM SCHEMA
   */
  getFieldType(fieldPath) {
    if (!this.model || !this.model.schema) return null;

    try {
      const path = this.model.schema.path(fieldPath);
      return path ? path.instance : null;
    } catch {
      return null;
    }
  }

  /**
   * ADVANCED FILTERING WITH OPERATOR SUPPORT
   */
  filter(options = {}) {
    const start = Date.now();

    // Extract query params
    const queryObj = { ...this.queryString };
    const excluded = [
      'page', 'limit', 'sort', 'fields', 'search',
      'populate', 'lastId', 'lastDate', 'select',
      'include', 'exclude', 'group', 'distinct'
    ];
    excluded.forEach(field => delete queryObj[field]);

    // Build match stage
    const matchStage = { ...this.baseFilter };
    const orConditions = [];
    const andConditions = [];

    // Process each query parameter
    for (const [key, value] of Object.entries(queryObj)) {
      // Handle special operators
      if (key.endsWith('[or]')) {
        const field = key.replace('[or]', '');
        const fieldType = this.getFieldType(field);
        const values = Array.isArray(value) ? value : value.split(',').map(v => v.trim());
        orConditions.push({
          [field]: { $in: values.map(v => ApiFeatures.coerceValue(v, fieldType)) }
        });
        continue;
      }

      if (key.endsWith('[and]')) {
        const field = key.replace('[and]', '');
        const fieldType = this.getFieldType(field);
        const values = Array.isArray(value) ? value : value.split(',').map(v => v.trim());
        values.forEach(v => {
          andConditions.push({
            [field]: ApiFeatures.coerceValue(v, fieldType)
          });
        });
        continue;
      }

      // Handle range operators: field[gt]=10&field[lt]=100
      if (key.includes('[') && key.includes(']')) {
        const match = key.match(/^(.+)\[(\w+)\]$/);
        if (match) {
          const [, field, operator] = match;
          if (!this.config.allowedOperators.includes(operator)) {
            throw new ValidationError(`Operator ${operator} not allowed`);
          }

          const fieldType = this.getFieldType(field);
          const coercedValue = ApiFeatures.coerceValue(value, fieldType);

          if (!matchStage[field]) matchStage[field] = {};
          matchStage[field][`$${operator}`] = coercedValue;
          continue;
        }
      }

      // Handle JSON-like nested queries: user.name=John
      if (key.includes('.')) {
        const keys = key.split('.');
        let current = matchStage;
        for (let i = 0; i < keys.length - 1; i++) {
          const k = keys[i];
          if (!current[k]) current[k] = {};
          current = current[k];
        }
        const lastKey = keys[keys.length - 1];
        const fieldType = this.getFieldType(key);
        current[lastKey] = ApiFeatures.coerceValue(value, fieldType);
        continue;
      }

      // Default equality match
      const fieldType = this.getFieldType(key);
      matchStage[key] = ApiFeatures.coerceValue(value, fieldType);
    }

    // Apply OR conditions (with limit)
    if (orConditions.length > 0) {
      if (orConditions.length > this.config.maxOrClauses) {
        throw new ValidationError(
          `Too many OR conditions. Max: ${this.config.maxOrClauses}`,
          { provided: orConditions.length }
        );
      }
      if (this.isAggregate) {
        this.query.pipeline().push({ $match: { $or: orConditions } });
      } else {
        this.query = this.query.find({ $or: orConditions });
      }
    }

    // Apply AND conditions
    if (andConditions.length > 0) {
      if (this.isAggregate) {
        this.query.pipeline().push({ $match: { $and: andConditions } });
      } else {
        this.query = this.query.find({ $and: andConditions });
      }
    }

    // Apply main match stage
    if (Object.keys(matchStage).length > 0) {
      // Enforce soft delete if applicable
      if (this.model?.schema?.paths?.isDeleted && matchStage.isDeleted === undefined) {
        matchStage.isDeleted = { $ne: true };
      }

      // Enforce organization isolation if applicable
      if (this.securityContext.organizationId && !matchStage.organizationId) {
        matchStage.organizationId = this.securityContext.organizationId;
      }

      if (this.isAggregate) {
        this.query.pipeline().push({ $match: matchStage });
      } else {
        this.query = this.query.find(matchStage);
      }
    }

    this.performance.stages.push({
      name: 'filter',
      duration: Date.now() - start,
      conditions: {
        match: Object.keys(matchStage).length,
        or: orConditions.length,
        and: andConditions.length
      }
    });

    return this;
  }

  /**
   * FULL-TEXT SEARCH WITH MULTIPLE STRATEGIES
   */
  search(config = {}) {
    const start = Date.now();
    const term = this.queryString.search;
    if (!term) return this;

    const strategies = config.strategies || ['text', 'regex', 'autocomplete'];
    const fields = config.fields || [];
    const searchStages = [];

    // Strategy 1: MongoDB Text Search (requires text index)
    // if (strategies.includes('text') && this.model?.schema?.indexes?.some(idx => idx[0]?.$** === 'text')) {
    //   searchStages.push({ $match: { $text: { $search: term } } });
    // }

    // Strategy 2: Regex search on specified fields
    if (strategies.includes('regex') && fields.length > 0) {
      const regexConditions = fields.map(field => ({
        [field]: { $regex: term, $options: 'i' }
      }));
      searchStages.push({ $match: { $or: regexConditions } });
    }

    // Strategy 3: Autocomplete (prefix search)
    if (strategies.includes('autocomplete') && fields.length > 0) {
      const prefixConditions = fields.map(field => ({
        [field]: { $regex: `^${term}`, $options: 'i' }
      }));
      searchStages.push({ $match: { $or: prefixConditions } });
    }

    // Strategy 4: Phonetic search (using soundex/metaphone)
    if (strategies.includes('phonetic') && this.model?.schema?.phoneticFields) {
      // Implementation would require phonetic index
    }

    // Apply search stages
    if (searchStages.length > 0) {
      if (this.isAggregate) {
        if (searchStages.length === 1) {
          this.query.pipeline().push(searchStages[0]);
        } else {
          this.query.pipeline().push({ $match: { $or: searchStages.map(s => s.$match) } });
        }
      } else {
        const conditions = searchStages.map(stage => stage.$match);
        this.query = this.query.find(conditions.length === 1 ? conditions[0] : { $or: conditions });
      }
    }

    this.performance.stages.push({
      name: 'search',
      duration: Date.now() - start,
      term,
      strategies: strategies.filter(s => searchStages.some(ss => ss[s]))
    });

    return this;
  }

  /**
   * INTELLIGENT SORTING
   */
  sort(defaultSort = '-createdAt') {
    const start = Date.now();

    let sortString = this.queryString.sort || defaultSort;

    // Security: Validate sort fields
    const allowedSortFields = this.config.allowedSortFields || [];
    if (allowedSortFields.length > 0) {
      const requestedFields = sortString.split(',').map(s => s.replace('-', '').trim());
      const invalidFields = requestedFields.filter(f => !allowedSortFields.includes(f));
      if (invalidFields.length > 0) {
        throw new ValidationError(`Invalid sort fields: ${invalidFields.join(', ')}`);
      }
    }

    if (this.isAggregate) {
      const sortStage = {};
      sortString.split(',').forEach(field => {
        const direction = field.startsWith('-') ? -1 : 1;
        const fieldName = field.replace(/^-/, '');
        sortStage[fieldName] = direction;
      });
      this.query.pipeline().push({ $sort: sortStage });
    } else {
      this.query = this.query.sort(sortString);

      // Add secondary sort for cursor pagination consistency
      if (!sortString.includes('_id')) {
        const primarySort = sortString.split(',')[0];
        const secondarySort = primarySort.startsWith('-') ? '-_id' : '_id';
        this.query = this.query.sort(`${sortString},${secondarySort}`);
      }
    }

    this.performance.stages.push({
      name: 'sort',
      duration: Date.now() - start,
      sort: sortString
    });

    return this;
  }

  /**
   * FIELD SELECTION WITH SECURITY
   */
  select(allowedFields = []) {
    const start = Date.now();
    const fields = this.queryString.fields || this.queryString.select;
    if (!fields) return this;

    const requestedFields = fields.split(',').map(f => f.trim());

    // Apply field security
    const finalFields = allowedFields.length > 0
      ? requestedFields.filter(field => {
          // Allow field if in allowed list or is a safe field
          const isAllowed = allowedFields.includes(field);
          const isSafe = ['_id', 'createdAt', 'updatedAt'].includes(field);
          return isAllowed || isSafe;
        })
      : requestedFields;

    if (finalFields.length === 0) return this;

    if (this.isAggregate) {
      const projection = {};
      finalFields.forEach(field => {
        projection[field] = 1;
      });
      this.query.pipeline().push({ $project: projection });
    } else {
      this.query = this.query.select(finalFields.join(' '));
    }

    this.performance.stages.push({
      name: 'select',
      duration: Date.now() - start,
      requested: requestedFields.length,
      allowed: finalFields.length
    });

    return this;
  }

  /**
   * HYBRID PAGINATION (Offset + Cursor)
   */
  paginate(strategy = 'offset') {
    const start = Date.now();

    switch (strategy.toLowerCase()) {
      case 'cursor':
        return this.cursorPaginate();
      case 'keyset':
        return this.keysetPaginate();
      case 'offset':
      default:
        return this.offsetPaginate();
    }
  }

  offsetPaginate() {
    const page = Math.max(1, parseInt(this.queryString.page) || 1);
    const limit = Math.min(
      parseInt(this.queryString.limit) || this.config.defaultLimit,
      this.config.maxLimit
    );
    const skip = (page - 1) * limit;

    this.pagination = {
      strategy: 'offset',
      page,
      limit,
      skip,
      hasNext: null,
      hasPrev: page > 1
    };

    if (this.isAggregate) {
      this.query.pipeline().push(
        { $skip: skip },
        { $limit: limit }
      );
    } else {
      this.query = this.query.skip(skip).limit(limit);
    }

    this.performance.stages.push({
      name: 'paginate_offset',
      duration: Date.now() - start,
      page,
      limit,
      skip
    });

    return this;
  }

  cursorPaginate() {
    const cursor = this.queryString.cursor || this.queryString.lastId;
    if (!cursor) return this.offsetPaginate();

    const limit = Math.min(
      parseInt(this.queryString.limit) || this.config.defaultLimit,
      this.config.maxLimit
    );

    const cursorField = this.queryString.cursorField || '_id';
    const cursorValue = ApiFeatures.coerceValue(cursor, this.getFieldType(cursorField));

    const cursorCondition = {
      [cursorField]: { $lt: cursorValue }
    };

    this.pagination = {
      strategy: 'cursor',
      cursor,
      limit,
      cursorField
    };

    if (this.isAggregate) {
      this.query.pipeline().push(
        { $match: cursorCondition },
        { $sort: { [cursorField]: -1 } },
        { $limit: limit }
      );
    } else {
      this.query = this.query
        .find(cursorCondition)
        .sort({ [cursorField]: -1 })
        .limit(limit);
    }

    return this;
  }

  /**
   * ADVANCED POPULATION WITH TRANSFORMS
   */
  populate(populationMap = {}) {
    const start = Date.now();

    if (!this.queryString.populate || this.isAggregate) return this;

    const requestedPopulations = this.queryString.populate.split(',').map(p => p.trim());

    requestedPopulations.forEach(path => {
      const config = populationMap[path] || {};

      const populateConfig = {
        path,
        select: config.select || '-__v -password',
        match: config.match || {},
        options: config.options || {},
        populate: config.populate || []
      };

      // Apply security filters to populate
      if (this.securityContext.organizationId) {
        const Model = this.model.schema.path(path)?.options?.ref;
        if (Model && Model.schema?.paths?.organizationId) {
          populateConfig.match.organizationId = this.securityContext.organizationId;
        }
      }

      this.query = this.query.populate(populateConfig);
    });

    this.performance.stages.push({
      name: 'populate',
      duration: Date.now() - start,
      populations: requestedPopulations.length
    });

    return this;
  }

  /**
   * AGGREGATION PIPELINE BUILDER
   */
  aggregate(pipeline = []) {
    this.isAggregate = true;
    if (!Array.isArray(this.query.pipeline)) {
      this.query = this.model.aggregate();
    }

    pipeline.forEach(stage => {
      this.query.pipeline().push(stage);
    });

    return this;
  }

  /**
   * CACHE LAYER
   */
  async getFromCache() {
    if (!this.config.enableCache) return null;

    const cacheKey = this.generateCacheKey();
    const cached = await redis.get(cacheKey);

    if (cached) {
      this.metadata.cacheHit = true;
      this.metadata.fromCache = true;
      return JSON.parse(cached);
    }

    return null;
  }

  async setCache(result, ttl = null) {
    if (!this.config.enableCache || this.metadata.fromCache) return;

    const cacheKey = this.generateCacheKey();
    const cacheTTL = ttl || this.config.cacheTTL;

    await redis.setex(
      cacheKey,
      cacheTTL,
      JSON.stringify({
        data: result,
        metadata: {
          cachedAt: new Date().toISOString(),
          ttl: cacheTTL,
          requestId: this.requestId
        }
      })
    );
  }

  generateCacheKey() {
    const params = {
      query: this.queryString,
      filter: this.baseFilter,
      model: this.model?.modelName,
      userId: this.user?.id
    };

    return `api:${this.model?.modelName}:${require('crypto')
      .createHash('md5')
      .update(JSON.stringify(params))
      .digest('hex')}`;
  }

  /**
   * EXECUTE WITH ALL BELLS AND WHISTLES
   */
  async execute(options = {}) {
    const executeStart = Date.now();
    let result;

    try {
      // 1. Check cache
      if (options.useCache !== false) {
        const cached = await this.getFromCache();
        if (cached) {
          this.metadata.executionTime = Date.now() - executeStart;
          return {
            ...cached,
            metadata: {
              ...this.metadata,
              ...cached.metadata
            },
            performance: this.performance
          };
        }
      }

      // 2. Set timeout
      if (this.config.timeout) {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new QueryError('Query timeout exceeded')), this.config.timeout);
        });

        // 3. Execute query
        const queryPromise = this.isAggregate
          ? this.query.exec()
          : this.query.lean(options.lean !== false); // Use lean by default

        result = await Promise.race([queryPromise, timeoutPromise]);
      } else {
        result = this.isAggregate
          ? await this.query.exec()
          : await this.query.lean(options.lean !== false);
      }

      // 4. Transform result if needed
      if (options.transform && typeof options.transform === 'function') {
        result = options.transform(result);
      }

      // 5. Get pagination metadata for non-aggregate queries
      let paginationMeta = {};
      if (!this.isAggregate && this.pagination && this.pagination.strategy === 'offset') {
        const total = await this.model.countDocuments(this.getFinalFilter());
        const pages = Math.ceil(total / this.pagination.limit);

        paginationMeta = {
          total,
          pages,
          hasNext: this.pagination.page < pages,
          hasPrev: this.pagination.page > 1,
          page: this.pagination.page,
          limit: this.pagination.limit
        };
      }

      // 6. Set cache
      if (options.useCache !== false && result) {
        await this.setCache(result);
      }

      // 7. Update metadata
      this.metadata.executionTime = Date.now() - executeStart;
      this.metadata.queryCount = this.isAggregate ? 1 : 2; // Count + data query

      return {
        data: result,
        pagination: paginationMeta,
        metadata: {
          ...this.metadata,
          requestId: this.requestId,
          timestamp: new Date().toISOString()
        },
        performance: this.performance
      };

    } catch (error) {
      // Log error with context
      console.error('ApiFeatures execution error:', {
        error: error.message,
        query: this.queryString,
        model: this.model?.modelName,
        requestId: this.requestId,
        userId: this.user?.id
      });

      throw error;
    }
  }

  /**
   * UTILITY METHODS
   */
  getFinalFilter() {
    if (this.isAggregate) {
      const matchStages = this.query.pipeline().filter(stage => stage.$match);
      return matchStages.reduce((acc, stage) => ({ ...acc, ...stage.$match }), {});
    }
    return this.query.getFilter();
  }

  explain() {
    if (this.isAggregate) {
      return this.query.explain();
    }
    return this.query.explain('executionStats');
  }

  clone() {
    return new ApiFeatures(
      this.query.clone ? this.query.clone() : this.query,
      { ...this.queryString },
      {
        model: this.model,
        isAggregate: this.isAggregate,
        baseFilter: { ...this.baseFilter },
        user: { ...this.user },
        config: { ...this.config }
      }
    );
  }
}

module.exports = ApiFeatures;
