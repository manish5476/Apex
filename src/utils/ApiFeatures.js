// utils/ApiFeatures.js - ENTERPRISE-GRADE API FEATURES
const mongoose = require('mongoose');
const redis = require('./redis'); // Assume Redis client
const { QueryError, ValidationError, RateLimitError } = require('./errors');

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
    if (strategies.includes('text') && this.model?.schema?.indexes?.some(idx => idx[0]?.$** === 'text')) {
      searchStages.push({ $match: { $text: { $search: term } } });
    }

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

// const mongoose = require("mongoose");

// class ApiFeatures {
//   constructor(query, queryString, isAggregate = false) {
//     this.query = query;
//     this.queryString = queryString;
//     this.isAggregate = isAggregate;

//     this.baseFilter = {};       // used to preserve factory filters
//     this.pagination = {};
//   }

//   /************************************************************
//    * BASE FILTER SUPPORT (CRITICAL FIX)
//    ************************************************************/
//   setBaseFilter(filterObj = {}) {
//     this.baseFilter = filterObj;
//     return this;
//   }

//   /************************************************************
//    * TYPE COERCION
//    ************************************************************/
//   static coerceValue(value) {
//     if (typeof value !== "string") return value;

//     if (value === "true" || value === "false") return value === "true";
//     if (!isNaN(value)) return Number(value);
//     if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);

//     const d = new Date(value);
//     if (!isNaN(d)) return d;

//     return value;
//   }

//   /************************************************************
//    * ADVANCED FILTERING WITH OR / IN / RANGE
//    ************************************************************/
//   filter() {
//     const q = { ...this.queryString };
//     const excluded = ["page", "limit", "sort", "fields", "search", "populate", "lastId", "lastDate"];
//     excluded.forEach(f => delete q[f]);

//     const match = { ...this.baseFilter }; // <-- CRITICAL LINE
//     const or = [];

//     for (const key in q) {
//       const value = q[key];

//       // OR: field[or]=a,b,c
//       if (key.endsWith("[or]")) {
//         const field = key.replace("[or]", "");
//         const arr = value.split(",").map(v => ApiFeatures.coerceValue(v.trim()));
//         or.push({ [field]: { $in: arr } });
//         continue;
//       }

//       // IN via pipe → a|b|c
//       if (typeof value === "string" && value.includes("|")) {
//         match[key] = { $in: value.split("|").map(v => ApiFeatures.coerceValue(v.trim())) };
//         continue;
//       }

//       // Range operators
//       if (typeof value === "object" && value !== null) {
//         match[key] = {};
//         for (const op in value) {
//           match[key][`$${op}`] = ApiFeatures.coerceValue(value[op]);
//         }
//         continue;
//       }

//       // Default
//       match[key] = ApiFeatures.coerceValue(value);
//     }

//     // soft delete enforcement unless user overrides
//     if (this.query.model?.schema?.path("isDeleted") && match.isDeleted === undefined) {
//       match.isDeleted = { $ne: true };
//     }

//     if (this.isAggregate) {
//       this.query.pipeline().push({ $match: match });
//       if (or.length) this.query.pipeline().push({ $match: { $or: or } });
//     } else {
//       this.query = this.query.find(match);
//       if (or.length) this.query = this.query.find({ $or: or });
//     }

//     return this;
//   }

//   /************************************************************
//    * SEARCH / TEXT
//    ************************************************************/
//   search(fields = []) {
//     const term = this.queryString.search;
//     if (!term) return this;

//     const textMatch = { $text: { $search: term } };

//     // text search for indexed fields
//     if (this.isAggregate) {
//       this.query.pipeline().push({ $match: textMatch });
//       return this;
//     }

//     // fallback regex search
//     const regex = { $regex: term, $options: "i" };

//     const conds = [];
//     if (fields.length) {
//       fields.forEach(f => conds.push({ [f]: regex }));
//     }

//     if (conds.length) {
//       this.query = this.query.find({ $or: conds });
//     }

//     return this;
//   }

//   /************************************************************
//    * SORTING
//    ************************************************************/
//   sort() {
//     const s = this.queryString.sort
//       ? this.queryString.sort.split(",").join(" ")
//       : "-createdAt -_id";

//     if (this.isAggregate) {
//       const parsed = {};
//       s.split(" ").forEach(f => {
//         parsed[f.replace("-", "")] = f.startsWith("-") ? -1 : 1;
//       });
//       this.query.pipeline().push({ $sort: parsed });
//     } else {
//       this.query = this.query.sort(s);
//     }

//     return this;
//   }

//   /************************************************************
//    * FIELDS LIMITING
//    ************************************************************/
//   limitFields() {
//     const f = this.queryString.fields;
//     if (!f) return this;

//     if (this.isAggregate) {
//       const proj = {};
//       f.split(",").forEach(field => proj[field] = 1);
//       this.query.pipeline().push({ $project: proj });
//     } else {
//       this.query = this.query.select(f.split(",").join(" "));
//     }

//     return this;
//   }

//   /************************************************************
//    * CURSOR PAGINATION
//    ************************************************************/
//   cursorPaginate() {
//     const lastId = this.queryString.lastId;
//     const lastDate = this.queryString.lastDate;

//     if (!lastId && !lastDate) return this;

//     const cond = {};

//     if (lastDate) cond.date = { $lt: new Date(lastDate) };
//     if (lastId) cond._id = { $lt: new mongoose.Types.ObjectId(lastId) };

//     if (this.isAggregate) {
//       this.query.pipeline().push({ $match: cond });
//     } else {
//       this.query = this.query.find(cond);
//     }

//     return this;
//   }

//   /************************************************************
//    * PAGE / LIMIT PAGINATION
//    ************************************************************/
//   paginate() {
//     const page = Number(this.queryString.page) || 1;
//     const limit = Number(this.queryString.limit) || 50;
//     const skip = (page - 1) * limit;

//     this.pagination = { page, limit, skip };

//     if (this.isAggregate) {
//       this.query.pipeline().push({ $skip: skip }, { $limit: limit });
//     } else {
//       this.query = this.query.skip(skip).limit(limit);
//     }

//     return this;
//   }

//   /************************************************************
//    * POPULATE
//    ************************************************************/
//   populate(map = {}) {
//     if (!this.queryString.populate || this.isAggregate) return this;

//     const fields = this.queryString.populate.split(",");
//     fields.forEach(f => {
//       this.query = this.query.populate({
//         path: f,
//         select: map[f] || "-__v"
//       });
//     });

//     return this;
//   }

//   /************************************************************
//    * EXECUTE
//    ************************************************************/
//   async execute() {
//     if (this.isAggregate) {
//       const data = await this.query.exec();
//       return { data, results: data.length };
//     }

//     const docs = await this.query;
//     const count = await this.query.model.countDocuments(this.baseFilter);

//     const pages = Math.ceil(count / this.pagination.limit);

//     return {
//       data: docs,
//       results: docs.length,
//       total: count,
//       pagination: {
//         ...this.pagination,
//         total: count,
//         pages,
//         hasNext: this.pagination.page < pages,
//         hasPrev: this.pagination.page > 1
//       }
//     };
//   }
// }

// module.exports = ApiFeatures;


// // /**
// //  * -------------------------------------------------------------
// //  * ApiFeatures Utility - Enhanced Version
// //  * -------------------------------------------------------------
// //  * A universal Mongoose query builder that supports:
// //  * ✅ Filtering (with advanced operators)
// //  * ✅ Sorting
// //  * ✅ Field limiting
// //  * ✅ Pagination (with metadata)
// //  * ✅ Multi-value queries (comma-separated)
// //  * ✅ Regex search
// //  * ✅ Soft-delete safe queries
// //  * ✅ Nested field access
// //  * ✅ Date range queries
// //  * ✅ Exclude fields
// //  * -------------------------------------------------------------
// //  */

// // class ApiFeatures {
// //   constructor(query, queryString) {
// //     this.query = query; // Mongoose query (e.g., Model.find())
// //     this.queryString = queryString; // Express req.query
// //     this.pagination = {}; // Metadata for pagination
// //     this.total = 0; // Total documents count
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * ADVANCED FILTERING
// //    * Supports:
// //    * - price[gte]=100&price[lte]=500 (range queries)
// //    * - status=active,inactive (multi-value)
// //    * - name=john (regex search for strings)
// //    * - "address.city"="New York" (nested fields)
// //    * - date[gte]=2024-01-01&date[lte]=2024-12-31 (date ranges)
// //    * -------------------------------------------------------------
// //    */
// //   filter() {
// //     const queryObj = { ...this.queryString };
// //     const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
// //     excludedFields.forEach((el) => delete queryObj[el]);

// //     const mongoQuery = {};

// //     for (const key in queryObj) {
// //       if (!Object.hasOwn(queryObj, key)) continue;
// //       const value = queryObj[key];
// //       const schemaType = this.query.model.schema.path(key)?.instance;

// //       // 1️⃣ Handle multi-value fields (e.g., status=active,inactive)
// //       if (typeof value === 'string' && value.includes(',')) {
// //         mongoQuery[key] = { $in: value.split(',').map((v) => v.trim()) };
// //       }
      
// //       // 2️⃣ Handle object operators (gte, lte, gt, lt, ne, regex, options)
// //       else if (typeof value === 'object' && value !== null) {
// //         mongoQuery[key] = {};
// //         for (const op in value) {
// //           if (['gte', 'gt', 'lte', 'lt', 'ne', 'eq'].includes(op)) {
// //             mongoQuery[key]['$' + op] = value[op];
// //           } else if (op === 'regex') {
// //             mongoQuery[key]['$regex'] = value[op];
// //           } else if (op === 'options') {
// //             mongoQuery[key]['$options'] = value[op];
// //           }
// //         }
// //       }
      
// //       // 3️⃣ Handle boolean values (true/false strings)
// //       else if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) {
// //         mongoQuery[key] = value.toLowerCase() === 'true';
// //       }
      
// //       // 4️⃣ Handle string values with regex (for search)
// //       else if (typeof value === 'string' && schemaType === 'String') {
// //         mongoQuery[key] = { $regex: value, $options: 'i' };
// //       }
      
// //       // 5️⃣ Handle nested fields safely (e.g., "address.city"="Delhi")
// //       else if (key.includes('.')) {
// //         mongoQuery[key] = value;
// //       }
      
// //       // 6️⃣ Handle date strings (convert to Date objects)
// //       else if (typeof value === 'string' && schemaType === 'Date') {
// //         const date = new Date(value);
// //         if (!isNaN(date)) {
// //           mongoQuery[key] = date;
// //         } else {
// //           mongoQuery[key] = value;
// //         }
// //       }
      
// //       // 7️⃣ Fallback to exact match (ObjectIds, numbers, etc.)
// //       else {
// //         mongoQuery[key] = value;
// //       }
// //     }

// //     // Exclude soft-deleted records by default if schema supports it
// //     if (this.query.model.schema.path('isDeleted')) {
// //       mongoQuery.isDeleted = { $ne: true };
// //     }

// //     // Exclude inactive records by default if schema supports it
// //     if (this.query.model.schema.path('isActive')) {
// //       mongoQuery.isActive = { $ne: false };
// //     }

// //     this.query = this.query.find(mongoQuery);
// //     return this;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * FULL-TEXT SEARCH
// //    * Example: ?search=keyword
// //    * Searches in predefined fields or all string fields
// //    * -------------------------------------------------------------
// //    */
// //   search(searchFields = ['name', 'title', 'description']) {
// //     if (this.queryString.search) {
// //       const searchTerm = this.queryString.search;
// //       const searchConditions = [];

// //       searchFields.forEach(field => {
// //         searchConditions.push({
// //           [field]: { $regex: searchTerm, $options: 'i' }
// //         });
// //       });

// //       // If there are existing query conditions, use $and
// //       const currentQuery = this.query.getFilter();
// //       if (Object.keys(currentQuery).length > 0) {
// //         this.query = this.query.find({
// //           $and: [
// //             currentQuery,
// //             { $or: searchConditions }
// //           ]
// //         });
// //       } else {
// //         this.query = this.query.find({ $or: searchConditions });
// //       }
// //     }
// //     return this;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * SORTING
// //    * Example:
// //    * ?sort=price,-createdAt (ascending price, descending createdAt)
// //    * -------------------------------------------------------------
// //    */
// //   sort() {
// //     if (this.queryString.sort) {
// //       const sortBy = this.queryString.sort.split(',').join(' ');
// //       this.query = this.query.sort(sortBy);
// //     } else {
// //       // Default sort by newest first
// //       this.query = this.query.sort('-createdAt _id');
// //     }
// //     return this;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * FIELD LIMITING
// //    * Example:
// //    * ?fields=name,price,category (include only these)
// //    * ?fields=-password,-__v (exclude these)
// //    * -------------------------------------------------------------
// //    */
// //   limitFields() {
// //     if (this.queryString.fields) {
// //       const fields = this.queryString.fields.split(',').join(' ');
// //       this.query = this.query.select(fields);
// //     } else {
// //       // Default exclude internal fields
// //       const defaultExcludes = '-__v -createdAt -updatedAt -isDeleted';
// //       this.query = this.query.select(defaultExcludes);
// //     }
// //     return this;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * PAGINATION WITH METADATA
// //    * Example: ?page=2&limit=10
// //    * Returns pagination metadata for frontend
// //    * -------------------------------------------------------------
// //    */
// //   paginate() {
// //     const page = parseInt(this.queryString.page, 10) || 1;
// //     const limit = parseInt(this.queryString.limit, 10) || 20;
// //     const skip = (page - 1) * limit;

// //     this.query = this.query.skip(skip).limit(limit);
    
// //     this.pagination = {
// //       page,
// //       limit,
// //       skip,
// //       hasNext: false,
// //       hasPrev: page > 1
// //     };

// //     return this;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * GET PAGINATION METADATA
// //    * Call this after executing the query
// //    * -------------------------------------------------------------
// //    */
// //   async getPaginationMetadata() {
// //     const totalCount = await this.query.model.countDocuments(this.query.getFilter());
// //     const totalPages = Math.ceil(totalCount / this.pagination.limit);
    
// //     this.pagination.total = totalCount;
// //     this.pagination.pages = totalPages;
// //     this.pagination.hasNext = this.pagination.page < totalPages;
    
// //     return this.pagination;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * POPULATE RELATIONS
// //    * Example: ?populate=category,author
// //    * -------------------------------------------------------------
// //    */
// //   populate(populateOptions = {}) {
// //     if (this.queryString.populate) {
// //       const populateFields = this.queryString.populate.split(',');
// //       populateFields.forEach(field => {
// //         this.query = this.query.populate({
// //           path: field,
// //           select: populateOptions[field] || '-__v'
// //         });
// //       });
// //     }
// //     return this;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * EXECUTE QUERY WITH ALL FEATURES
// //    * Convenience method to apply all features at once
// //    * -------------------------------------------------------------
// //    */
// //   async execute() {
// //     const docs = await this.query;
// //     const pagination = await this.getPaginationMetadata();
    
// //     return {
// //       data: docs,
// //       pagination,
// //       total: pagination.total,
// //       results: docs.length
// //     };
// //   }
// // }

// // module.exports = ApiFeatures;
// // // /**
// // //  * -------------------------------------------------------------
// // //  * ApiFeatures Utility - Enhanced Version
// // //  * -------------------------------------------------------------
// // //  * A universal Mongoose query builder that supports:
// // //  * ✅ Filtering (with advanced operators)
// // //  * ✅ Sorting
// // //  * ✅ Field limiting
// // //  * ✅ Pagination (with metadata)
// // //  * ✅ Multi-value queries (comma-separated)
// // //  * ✅ Regex search
// // //  * ✅ Soft-delete safe queries
// // //  * ✅ Nested field access
// // //  * ✅ Date range queries
// // //  * ✅ Exclude fields
// // //  * -------------------------------------------------------------
// // //  */

// // // class ApiFeatures {
// // //   constructor(query, queryString) {
// // //     this.query = query; // Mongoose query (e.g., Model.find())
// // //     this.queryString = queryString; // Express req.query
// // //     this.pagination = {}; // Metadata for pagination
// // //     this.total = 0; // Total documents count
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * ADVANCED FILTERING
// // //    * Supports:
// // //    * - price[gte]=100&price[lte]=500 (range queries)
// // //    * - status=active,inactive (multi-value)
// // //    * - name=john (regex search for strings)
// // //    * - "address.city"="New York" (nested fields)
// // //    * - date[gte]=2024-01-01&date[lte]=2024-12-31 (date ranges)
// // //    * -------------------------------------------------------------
// // //    */
// // //   filter() {
// // //     const queryObj = { ...this.queryString };
// // //     const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
// // //     excludedFields.forEach((el) => delete queryObj[el]);

// // //     const mongoQuery = {};

// // //     for (const key in queryObj) {
// // //       if (!Object.hasOwn(queryObj, key)) continue;
// // //       const value = queryObj[key];
// // //       const schemaType = this.query.model.schema.path(key)?.instance;

// // //       // 1️⃣ Handle multi-value fields (e.g., status=active,inactive)
// // //       if (typeof value === 'string' && value.includes(',')) {
// // //         mongoQuery[key] = { $in: value.split(',').map((v) => v.trim()) };
// // //       }
      
// // //       // 2️⃣ Handle object operators (gte, lte, gt, lt, ne, regex, options)
// // //       else if (typeof value === 'object' && value !== null) {
// // //         mongoQuery[key] = {};
// // //         for (const op in value) {
// // //           if (['gte', 'gt', 'lte', 'lt', 'ne', 'eq'].includes(op)) {
// // //             mongoQuery[key]['$' + op] = value[op];
// // //           } else if (op === 'regex') {
// // //             mongoQuery[key]['$regex'] = value[op];
// // //           } else if (op === 'options') {
// // //             mongoQuery[key]['$options'] = value[op];
// // //           }
// // //         }
// // //       }
      
// // //       // 3️⃣ Handle boolean values (true/false strings)
// // //       else if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) {
// // //         mongoQuery[key] = value.toLowerCase() === 'true';
// // //       }
      
// // //       // 4️⃣ Handle string values with regex (for search)
// // //       else if (typeof value === 'string' && schemaType === 'String') {
// // //         mongoQuery[key] = { $regex: value, $options: 'i' };
// // //       }
      
// // //       // 5️⃣ Handle nested fields safely (e.g., "address.city"="Delhi")
// // //       else if (key.includes('.')) {
// // //         mongoQuery[key] = value;
// // //       }
      
// // //       // 6️⃣ Handle date strings (convert to Date objects)
// // //       else if (typeof value === 'string' && schemaType === 'Date') {
// // //         const date = new Date(value);
// // //         if (!isNaN(date)) {
// // //           mongoQuery[key] = date;
// // //         } else {
// // //           mongoQuery[key] = value;
// // //         }
// // //       }
      
// // //       // 7️⃣ Fallback to exact match (ObjectIds, numbers, etc.)
// // //       else {
// // //         mongoQuery[key] = value;
// // //       }
// // //     }

// // //     // Exclude soft-deleted records by default if schema supports it
// // //     if (this.query.model.schema.path('isDeleted')) {
// // //       mongoQuery.isDeleted = { $ne: true };
// // //     }

// // //     // Exclude inactive records by default if schema supports it
// // //     if (this.query.model.schema.path('isActive')) {
// // //       mongoQuery.isActive = { $ne: false };
// // //     }

// // //     this.query = this.query.find(mongoQuery);
// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * FULL-TEXT SEARCH
// // //    * Example: ?search=keyword
// // //    * Searches in predefined fields or all string fields
// // //    * -------------------------------------------------------------
// // //    */
// // //   search(searchFields = ['name', 'title', 'description']) {
// // //     if (this.queryString.search) {
// // //       const searchTerm = this.queryString.search;
// // //       const searchConditions = [];

// // //       searchFields.forEach(field => {
// // //         searchConditions.push({
// // //           [field]: { $regex: searchTerm, $options: 'i' }
// // //         });
// // //       });

// // //       // If there are existing query conditions, use $and
// // //       const currentQuery = this.query.getFilter();
// // //       if (Object.keys(currentQuery).length > 0) {
// // //         this.query = this.query.find({
// // //           $and: [
// // //             currentQuery,
// // //             { $or: searchConditions }
// // //           ]
// // //         });
// // //       } else {
// // //         this.query = this.query.find({ $or: searchConditions });
// // //       }
// // //     }
// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * SORTING
// // //    * Example:
// // //    * ?sort=price,-createdAt (ascending price, descending createdAt)
// // //    * -------------------------------------------------------------
// // //    */
// // //   sort() {
// // //     if (this.queryString.sort) {
// // //       const sortBy = this.queryString.sort.split(',').join(' ');
// // //       this.query = this.query.sort(sortBy);
// // //     } else {
// // //       // Default sort by newest first
// // //       this.query = this.query.sort('-createdAt _id');
// // //     }
// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * FIELD LIMITING
// // //    * Example:
// // //    * ?fields=name,price,category (include only these)
// // //    * ?fields=-password,-__v (exclude these)
// // //    * -------------------------------------------------------------
// // //    */
// // //   limitFields() {
// // //     if (this.queryString.fields) {
// // //       const fields = this.queryString.fields.split(',').join(' ');
// // //       this.query = this.query.select(fields);
// // //     } else {
// // //       // Default exclude internal fields
// // //       const defaultExcludes = '-__v -createdAt -updatedAt -isDeleted';
// // //       this.query = this.query.select(defaultExcludes);
// // //     }
// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * PAGINATION WITH METADATA
// // //    * Example: ?page=2&limit=10
// // //    * Returns pagination metadata for frontend
// // //    * -------------------------------------------------------------
// // //    */
// // //   paginate() {
// // //     const page = parseInt(this.queryString.page, 10) || 1;
// // //     const limit = parseInt(this.queryString.limit, 10) || 20;
// // //     const skip = (page - 1) * limit;

// // //     this.query = this.query.skip(skip).limit(limit);
    
// // //     this.pagination = {
// // //       page,
// // //       limit,
// // //       skip,
// // //       hasNext: false,
// // //       hasPrev: page > 1
// // //     };

// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * GET PAGINATION METADATA
// // //    * Call this after executing the query
// // //    * -------------------------------------------------------------
// // //    */
// // //   async getPaginationMetadata() {
// // //     const totalCount = await this.query.model.countDocuments(this.query.getFilter());
// // //     const totalPages = Math.ceil(totalCount / this.pagination.limit);
    
// // //     this.pagination.total = totalCount;
// // //     this.pagination.pages = totalPages;
// // //     this.pagination.hasNext = this.pagination.page < totalPages;
    
// // //     return this.pagination;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * POPULATE RELATIONS
// // //    * Example: ?populate=category,author
// // //    * -------------------------------------------------------------
// // //    */
// // //   populate(populateOptions = {}) {
// // //     if (this.queryString.populate) {
// // //       const populateFields = this.queryString.populate.split(',');
// // //       populateFields.forEach(field => {
// // //         this.query = this.query.populate({
// // //           path: field,
// // //           select: populateOptions[field] || '-__v'
// // //         });
// // //       });
// // //     }
// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * EXECUTE QUERY WITH ALL FEATURES
// // //    * Convenience method to apply all features at once
// // //    * -------------------------------------------------------------
// // //    */
// // //   async execute() {
// // //     const docs = await this.query;
// // //     const pagination = await this.getPaginationMetadata();
    
// // //     return {
// // //       data: docs,
// // //       pagination,
// // //       total: pagination.total,
// // //       results: docs.length
// // //     };
// // //   }
// // // }

// // // module.exports = ApiFeatures;
// // // // /**
// // // //  * -------------------------------------------------------------
// // // //  * ApiFeatures Utility
// // // //  * -------------------------------------------------------------
// // // //  * A universal Mongoose query builder that supports:
// // // //  * ✅ Filtering
// // // //  * ✅ Sorting
// // // //  * ✅ Field limiting
// // // //  * ✅ Pagination
// // // //  * ✅ Muti-value queries
// // // //  * ✅ Regex search
// // // //  * ✅ Soft-delete safe queries
// // // //  * ✅ Nested field access
// // // //  * -------------------------------------------------------------
// // // //  */

// // // // class ApiFeatures {
// // // //   constructor(query, queryString) {
// // // //     this.query = query;           // Mongoose query (e.g., Model.find())
// // // //     this.queryString = queryString; // Express req.query
// // // //     this.pagination = {};         // Metadata for frontend pagination
// // // //   }

// // // //   /**
// // // //    * -------------------------------------------------------------
// // // //    * FILTERING
// // // //    * Example:
// // // //    * ?price[gte]=100&price[lte]=500&status=active,inactive
// // // //    * -------------------------------------------------------------
// // // //    */
// // // //   filter() {
// // // //     const queryObj = { ...this.queryString };
// // // //     const excludedFields = ['page', 'sort', 'limit', 'fields'];
// // // //     excludedFields.forEach((el) => delete queryObj[el]);

// // // //     const mongoQuery = {};

// // // //     for (const key in queryObj) {
// // // //       if (!Object.hasOwn(queryObj, key)) continue;

// // // //       const value = queryObj[key];
// // // //       const schemaType = this.query.model.schema.path(key)?.instance;

// // // //       // 1️⃣ Handle multi-value fields (e.g., status=active,inactive)
// // // //       if (typeof value === 'string' && value.includes(',')) {
// // // //         mongoQuery[key] = { $in: value.split(',').map((v) => v.trim()) };
// // // //       }

// // // //       // 2️⃣ Handle numeric operators (gte, lte, gt, lt)
// // // //       else if (typeof value === 'object' && value !== null) {
// // // //         mongoQuery[key] = {};
// // // //         for (const op in value) {
// // // //           if (['gte', 'gt', 'lte', 'lt'].includes(op)) {
// // // //             mongoQuery[key]['$' + op] = value[op];
// // // //           }
// // // //         }
// // // //       }

// // // //       // 3️⃣ Handle string values with regex (for search)
// // // //       else if (typeof value === 'string' && schemaType === 'String') {
// // // //         mongoQuery[key] = { $regex: value, $options: 'i' };
// // // //       }

// // // //       // 4️⃣ Handle nested fields safely (e.g., address.city=Delhi)
// // // //       else if (key.includes('.')) {
// // // //         mongoQuery[key] = value;
// // // //       }

// // // //       // 5️⃣ Fallback to exact match (ObjectIds, numbers, etc.)
// // // //       else {
// // // //         mongoQuery[key] = value;
// // // //       }
// // // //     }

// // // //     // Exclude soft-deleted records by default if schema supports it
// // // //     if (this.query.model.schema.path('isDeleted')) {
// // // //       mongoQuery.isDeleted = { $ne: true };
// // // //     }

// // // //     this.query = this.query.find(mongoQuery);
// // // //     return this;
// // // //   }

// // // //   /**
// // // //    * -------------------------------------------------------------
// // // //    * SORTING
// // // //    * Example:
// // // //    * ?sort=price,-createdAt
// // // //    * -------------------------------------------------------------
// // // //    */
// // // //   sort() {
// // // //     if (this.queryString.sort) {
// // // //       const sortBy = this.queryString.sort.split(',').join(' ');
// // // //       this.query = this.query.sort(sortBy);
// // // //     } else {
// // // //       // Default sort by newest first
// // // //       this.query = this.query.sort('-createdAt _id');
// // // //     }
// // // //     return this;
// // // //   }

// // // //   /**
// // // //    * -------------------------------------------------------------
// // // //    * FIELD LIMITING
// // // //    * Example:
// // // //    * ?fields=name,price,category
// // // //    * -------------------------------------------------------------
// // // //    */
// // // //   limitFields() {
// // // //     if (this.queryString.fields) {
// // // //       const fields = this.queryString.fields.split(',').join(' ');
// // // //       this.query = this.query.select(fields);
// // // //     } else {
// // // //       // Default exclude internal fields
// // // //       this.query = this.query.select('-__v -isDeleted');
// // // //     }
// // // //     return this;
// // // //   }

// // // //   /**
// // // //    * -------------------------------------------------------------
// // // //    * PAGINATION
// // // //    * Example:
// // // //    * ?page=2&limit=10
// // // //    * -------------------------------------------------------------
// // // //    */
// // // //   paginate() {
// // // //     const page = parseInt(this.queryString.page, 10) || 1;
// // // //     const limit = parseInt(this.queryString.limit, 10) || 20;
// // // //     const skip = (page - 1) * limit;

// // // //     this.query = this.query.skip(skip).limit(limit);
// // // //     this.pagination = { page, limit, skip };

// // // //     return this;
// // // //   }
// // // // }

// // // // module.exports = ApiFeatures;


// // // // // class ApiFeatures {
// // // // //     constructor(query, queryString) {
// // // // //         this.query = query; // Mongoose query object (e.g., Product.find())
// // // // //         this.queryString = queryString; // From Express (req.query)
// // // // //     }

// // // // //     /**
// // // // //      * Filters the query based on the query string.
// // // // //      * Handles operators like [gte], [gt], [lte], [lt], [regex], [options].
// // // // //      * Example URL: /api/products?price[gte]=100&name[regex]=phone
// // // // //      */
// // // // // //   filter() {
// // // // // //     const queryObj = { ...this.queryString };

// // // // // //     // remove reserved params
// // // // // //     const excludedFields = ['page', 'sort', 'limit', 'fields'];
// // // // // //     excludedFields.forEach(el => delete queryObj[el]);

// // // // // //     // build Mongo filter
// // // // // //     const mongoFilter = {};

// // // // // //     Object.keys(queryObj).forEach(key => {
// // // // // //         const val = queryObj[key];

// // // // // //         // Handle advanced query operators (gte, lte etc.)
// // // // // //         if (typeof val === 'object') {
// // // // // //             // Example: price[gte]=100
// // // // // //             mongoFilter[key] = {};
// // // // // //             Object.keys(val).forEach(op => {
// // // // // //                 mongoFilter[key][`$${op}`] = val[op];
// // // // // //             });
// // // // // //         } else {
// // // // // //             // For plain strings → convert to regex for partial match
// // // // // //             if (isNaN(val)) {
// // // // // //                 mongoFilter[key] = { $regex: val, $options: 'i' };
// // // // // //             } else {
// // // // // //                 mongoFilter[key] = val; // keep numbers as-is
// // // // // //             }
// // // // // //         }
// // // // // //     });

// // // // // //     this.query = this.query.find(mongoFilter);
// // // // // //     return this;
// // // // // // }
// // // // // filter() {
// // // // //     const queryObj = { ...this.queryString };
// // // // //     const excludedFields = ['page', 'sort', 'limit', 'fields'];
// // // // //     excludedFields.forEach(el => delete queryObj[el]);

// // // // //     const mongoQuery = {};

// // // // //     for (const key in queryObj) {
// // // // //         if (!queryObj.hasOwnProperty(key)) continue;

// // // // //         const value = queryObj[key];

// // // // //         // If numeric operators exist
// // // // //         if (typeof value === 'object' && value !== null) {
// // // // //             mongoQuery[key] = {};
// // // // //             for (const op in value) {
// // // // //                 if (['gte','gt','lte','lt'].includes(op)) {
// // // // //                     mongoQuery[key]['$' + op] = value[op];
// // // // //                 }
// // // // //             }
// // // // //         } 
// // // // //         // Only apply regex for string fields in schema
// // // // //         else if (typeof value === 'string' && this.query.model.schema.path(key)?.instance === 'String') {
// // // // //             mongoQuery[key] = { $regex: value, $options: 'i' };
// // // // //         } 
// // // // //         // Otherwise exact match (e.g., ObjectId)
// // // // //         else {
// // // // //             mongoQuery[key] = value;
// // // // //         }
// // // // //     }

// // // // //     this.query = this.query.find(mongoQuery);
// // // // //     return this;
// // // // // }


// // // // // // ------version 1
// // // // //     // filter() {
// // // // //     //     // 1. Create a shallow copy of the query string
// // // // //     //     const queryObj = { ...this.queryString };

// // // // //     //     // 2. Exclude special fields used for other features
// // // // //     //     const excludedFields = ['page', 'sort', 'limit', 'fields'];
// // // // //     //     excludedFields.forEach(el => delete queryObj[el]);

// // // // //     //     // 3. Convert to a JSON string to replace operators with MongoDB format ($gte, $gt, etc.)
// // // // //     //     let queryStr = JSON.stringify(queryObj);
// // // // //     //     queryStr = queryStr.replace(/\b(gte|gt|lte|lt|regex|options)\b/g, match => `$${match}`);

// // // // //     //     // 4. Apply the filter to the Mongoose query
// // // // //     //     this.query = this.query.find(JSON.parse(queryStr));

// // // // //     //     return this; // Return 'this' to allow chaining
// // // // //     // }

   
// // // // //     sort() {
// // // // //         if (this.queryString.sort) {
// // // // //             const sortBy = this.queryString.sort.split(',').join(' ');
// // // // //             this.query = this.query.sort(sortBy);
// // // // //         } else {
// // // // //             // Default sort if none is provided
// // // // //             this.query = this.query.sort('-createdAt');
// // // // //         }
// // // // //         return this;
// // // // //     }

// // // // //     /**
// // // // //      * Limits the fields returned in the results.
// // // // //      * Example URL: /api/products?fields=name,price,description
// // // // //      */
// // // // //     limitFields() {
// // // // //         if (this.queryString.fields) {
// // // // //             const fields = this.queryString.fields.split(',').join(' ');
// // // // //             this.query = this.query.select(fields);
// // // // //         } else {
// // // // //             // By default, exclude the '__v' field from Mongoose
// // // // //             this.query = this.query.select('-__v');
// // // // //         }
// // // // //         return this;
// // // // //     }

// // // // //     /**
// // // // //      * Paginates the results.
// // // // //      * Example URL: /api/products?page=2&limit=10
// // // // //      */
// // // // //     paginate() {
// // // // //         const page = parseInt(this.queryString.page, 10) || 1;
// // // // //         const limit = parseInt(this.queryString.limit, 10) || 100;
// // // // //         const skip = (page - 1) * limit;

// // // // //         this.query = this.query.skip(skip).limit(limit);
// // // // //         return this;
// // // // //     }
// // // // // }

// // // // // module.exports = ApiFeatures;

// // // // // // class ApiFeatures {
// // // // // //   constructor(query, queryString) {
// // // // // //     if (!queryString || typeof queryString !== 'object') {
// // // // // //       throw new Error('Query string must be a valid object');
// // // // // //     }
// // // // // //     this.query = query;
// // // // // //     this.queryString = queryString;
// // // // // //   }

// // // // // //   filter() {
// // // // // //     if (!this.query) {
// // // // // //       this.query = {}; // Initialize as an empty object if not already defined
// // // // // //     }

// // // // // //     // Handle nested filter object
// // // // // //     let filterObj = {};
// // // // // //     if (this.queryString.filter) {
// // // // // //       filterObj = { ...this.queryString.filter };
// // // // // //     } else {
// // // // // //       // If no filter object, use the entire queryString
// // // // // //       filterObj = { ...this.queryString };
// // // // // //     }

// // // // // //     // Remove pagination, sorting, and field limiting parameters
// // // // // //     const excludedFields = ['page', 'sort', 'limit', 'fields', 'filter'];
// // // // // //     excludedFields.forEach((el) => delete filterObj[el]);

// // // // // //     // Handle empty filter object
// // // // // //     if (Object.keys(filterObj).length === 0) {
// // // // // //       this.query = this.query.find({});
// // // // // //       return this;
// // // // // //     }

// // // // // //     // Process each field in the filter
// // // // // //     Object.keys(filterObj).forEach((key) => {
// // // // // //       const value = filterObj[key];
      
// // // // // //       // Handle regex search
// // // // // //       if (value && typeof value === 'object' && value.regex) {
// // // // // //         filterObj[key] = { $regex: value.regex, $options: 'i' };
// // // // // //       }
// // // // // //       // Handle numeric comparisons
// // // // // //       else if (value && typeof value === 'object') {
// // // // // //         const operators = ['gte', 'gt', 'lte', 'lt', 'ne', 'in', 'nin'];
// // // // // //         operators.forEach(op => {
// // // // // //           if (value[op] !== undefined) {
// // // // // //             filterObj[key] = { ...filterObj[key], [`$${op}`]: value[op] };
// // // // // //           }
// // // // // //         });
// // // // // //       }
// // // // // //       // Handle array values
// // // // // //       else if (Array.isArray(value)) {
// // // // // //         filterObj[key] = { $in: value };
// // // // // //       }
// // // // // //       // Handle comma-separated string values
// // // // // //       else if (typeof value === 'string' && value.includes(',')) {
// // // // // //         filterObj[key] = { $in: value.split(',').map(item => item.trim()) };
// // // // // //       }
// // // // // //       // // Handle nested queries
// // // // // //       // if (key.includes('.')) {
// // // // // //       //   const nestedKeys = key.split('.');
// // // // // //       //   let tempQuery = filterObj;
// // // // // //       //   for (let i = 0; i < nestedKeys.length - 1; i++) {
// // // // // //       //     tempQuery = tempQuery[nestedKeys[i]] = tempQuery[nestedKeys[i]] || {};
// // // // // //       //   }
// // // // // //       //   tempQuery[nestedKeys[nestedKeys.length - 1]] = filterObj[key];
// // // // // //       //   delete filterObj[key];
// // // // // //       // }
// // // // // //       if (key.includes('.')) {
// // // // // //         const nestedKeys = key.split('.');
// // // // // //         let tempQuery = filterObj;
// // // // // //         for (let i = 0; i < nestedKeys.length - 1; i++) {
// // // // // //           tempQuery = tempQuery[nestedKeys[i]] = tempQuery[nestedKeys[i]] || {};
// // // // // //         }
// // // // // //         tempQuery[nestedKeys[nestedKeys.length - 1]] = value; // use original value
// // // // // //         delete filterObj[key];
// // // // // //       } else {
// // // // // //         filterObj[key] = value; // set it only if not nested
// // // // // //       }
      
// // // // // //     });

// // // // // //     this.query = this.query.find(filterObj);
// // // // // //     return this;
// // // // // //   }

// // // // // //   sort() {
// // // // // //     if (this.queryString.sort) {
// // // // // //       const sortBy = this.queryString.sort.split(',').join(' ').trim();
// // // // // //       this.query = this.query.sort(sortBy || '-createdAt');
// // // // // //     } else {
// // // // // //       this.query = this.query.sort('-createdAt');
// // // // // //     }
// // // // // //     return this;
// // // // // //   }

// // // // // //   limitFields() {
// // // // // //     if (this.queryString.fields) {
// // // // // //       const fields = this.queryString.fields.split(',').join(' ').trim();
// // // // // //       this.query = this.query.select(fields || '-__v');
// // // // // //     } else {
// // // // // //       this.query = this.query.select('-__v');
// // // // // //     }
// // // // // //     return this;
// // // // // //   }

// // // // // //   paginate() {
// // // // // //     const page = Math.max(parseInt(this.queryString.page, 10) || 1, 1);
// // // // // //     const limit = Math.min(Math.max(parseInt(this.queryString.limit, 10) || 200, 1), 1000);
// // // // // //     const skip = (page - 1) * limit;

// // // // // //     if (skip < 0) {
// // // // // //       throw new Error('Invalid page number');
// // // // // //     }
// // // // // //     this.query = this.query.skip(skip).limit(limit);
// // // // // //     return this;
// // // // // //   }
// // // // // // }

// // // // // // module.exports = ApiFeatures;
// // // // ///////////////////////////////////////////////////////////////////////////////////////////////
// // // const mongoose = require("mongoose");

// // // /**
// // //  * -------------------------------------------------------------
// // //  * ApiFeatures (Enterprise Edition)
// // //  * -------------------------------------------------------------
// // //  * Supports:
// // //  *  ✓ Advanced Filtering
// // //  *  ✓ Nested AND / OR / IN / RANGE
// // //  *  ✓ Soft delete enforcement
// // //  *  ✓ Regex & fuzzy search
// // //  *  ✓ Text index search
// // //  *  ✓ Populate mapping
// // //  *  ✓ Pagination (page/limit)
// // //  *  ✓ Cursor pagination (lastId, lastDate)
// // //  *  ✓ Sorting
// // //  *  ✓ Field limiting
// // //  *  ✓ Numeric/Date/ObjectId coercion
// // //  *  ✓ Aggregation mode
// // //  * -------------------------------------------------------------
// // //  */

// // // class ApiFeatures {
// // //   constructor(query, queryString, isAggregate = false) {
// // //     this.query = query;                     // Mongoose query or aggregate
// // //     this.queryString = queryString;         // req.query
// // //     this.isAggregate = isAggregate;         // true when using aggregation pipelines
// // //     this.pagination = {};
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * COERCION UTILITIES
// // //    * -------------------------------------------------------------
// // //    */
// // //   static coerceValue(value) {
// // //     if (typeof value !== "string") return value;

// // //     if (value === "true" || value === "false") return value === "true";

// // //     if (!isNaN(value)) return Number(value);

// // //     if (mongoose.Types.ObjectId.isValid(value))
// // //       return new mongoose.Types.ObjectId(value);

// // //     const date = new Date(value);
// // //     if (!isNaN(date)) return date;

// // //     return value;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * ADVANCED FILTERING WITH NESTED OR
// // //    * -------------------------------------------------------------
// // //    * Support:
// // //    *   field=a|b|c              → $in
// // //    *   field[or]=a,b,c          → nested OR
// // //    *   (a=1 & b=2) | (c=3)       → custom OR groups
// // //    */
// // //   // filter() {
// // //   //   const q = { ...this.queryString };

// // //   //   const excluded = ["page", "limit", "sort", "fields", "search", "populate", "cursor", "lastId", "lastDate"];
// // //   //   excluded.forEach(f => delete q[f]);

// // //   //   const mongo = {};
// // //   //   const or = [];

// // //   //   for (const rawKey in q) {
// // //   //     const key = rawKey.trim();
// // //   //     const value = q[key];

// // //   //     // OR group handler: field[or]=a,b,c
// // //   //     if (key.endsWith("[or]")) {
// // //   //       const actualKey = key.replace("[or]", "");
// // //   //       const arr = value.split(",").map(v => ApiFeatures.coerceValue(v.trim()));
// // //   //       or.push({ [actualKey]: { $in: arr } });
// // //   //       continue;
// // //   //     }

// // //   //     // Standard OR via pipe: field=a|b|c
// // //   //     if (typeof value === "string" && value.includes("|")) {
// // //   //       mongo[key] = { $in: value.split("|").map(v => ApiFeatures.coerceValue(v.trim())) };
// // //   //       continue;
// // //   //     }

// // //   //     // Multi-value
// // //   //     if (typeof value === "string" && value.includes(",")) {
// // //   //       mongo[key] = { $in: value.split(",").map(v => ApiFeatures.coerceValue(v.trim())) };
// // //   //       continue;
// // //   //     }

// // //   //     // Range operators: price[gte], date[lte]
// // //   //     if (typeof value === "object" && value !== null) {
// // //   //       mongo[key] = {};
// // //   //       for (const op in value) {
// // //   //         mongo[key][`$${op}`] = ApiFeatures.coerceValue(value[op]);
// // //   //       }
// // //   //       continue;
// // //   //     }

// // //   //     // Nested field
// // //   //     if (key.includes(".")) {
// // //   //       mongo[key] = ApiFeatures.coerceValue(value);
// // //   //       continue;
// // //   //     }

// // //   //     mongo[key] = ApiFeatures.coerceValue(value);
// // //   //   }

// // //   //   // soft delete enforcement
// // //   //   if (this.query.model?.schema?.path("isDeleted")) {
// // //   //     mongo.isDeleted = { $ne: true };
// // //   //   }

// // //   //   const finalQuery = Object.keys(mongo).length ? [{ $match: mongo }] : [];

// // //   //   if (or.length) {
// // //   //     finalQuery.push({ $match: { $or: or } });
// // //   //   }

// // //   //   if (this.isAggregate) {
// // //   //     this.query.pipeline().push(...finalQuery);
// // //   //   } else {
// // //   //     const match = finalQuery.length ? finalQuery[0]["$match"] : {};
// // //   //     this.query = this.query.find(match);
// // //   //   }

// // //   //   return this;
// // //   // }
// // // filter() {
// // //     const q = { ...this.queryString };

// // //     const excluded = ["page", "limit", "sort", "fields", "search", "populate", "cursor", "lastId", "lastDate"];
// // //     excluded.forEach(f => delete q[f]);

// // //     const mongo = {};
// // //     const or = [];

// // //     for (const rawKey in q) {
// // //       const key = rawKey.trim();
// // //       const value = q[key];

// // //       if (key.endsWith("[or]")) {
// // //         const actualKey = key.replace("[or]", "");
// // //         const arr = value.split(",").map(v => ApiFeatures.coerceValue(v.trim()));
// // //         or.push({ [actualKey]: { $in: arr } });
// // //         continue;
// // //       }

// // //       if (typeof value === "string" && value.includes("|")) {
// // //         mongo[key] = { $in: value.split("|").map(v => ApiFeatures.coerceValue(v.trim())) };
// // //         continue;
// // //       }

// // //       if (typeof value === "object" && value !== null) {
// // //         mongo[key] = {};
// // //         for (const op in value) {
// // //           mongo[key][`$${op}`] = ApiFeatures.coerceValue(value[op]);
// // //         }
// // //         continue;
// // //       }

// // //       mongo[key] = ApiFeatures.coerceValue(value);
// // //     }

// // //     // 1. Get existing filters (like organizationId from Factory)
// // //     const existingFilters = this.isAggregate ? {} : this.query.getFilter();
    
// // //     // 2. Merge existing filters with new mongo filters
// // //     const combinedMatch = { ...existingFilters, ...mongo };

// // //     // 3. Handle soft delete only if not already explicitly queried
// // //     if (this.query.model?.schema?.path("isDeleted") && combinedMatch.isDeleted === undefined) {
// // //       combinedMatch.isDeleted = { $ne: true };
// // //     }

// // //     if (this.isAggregate) {
// // //       const stages = [];
// // //       if (Object.keys(combinedMatch).length) stages.push({ $match: combinedMatch });
// // //       if (or.length) stages.push({ $match: { $or: or } });
// // //       this.query.pipeline().push(...stages);
// // //     } else {
// // //       // FIX: Apply the merged filters
// // //       this.query = this.query.find(combinedMatch);
// // //       if (or.length) {
// // //         this.query = this.query.find({ $or: or });
// // //       }
// // //     }

// // //     return this;
// // //   }
// // //   /**
// // //    * -------------------------------------------------------------
// // //    * SEARCH + FUZZY + TEXT INDEX
// // //    * -------------------------------------------------------------
// // //    */
// // //   search(fields = []) {
// // //     const term = this.queryString.search;
// // //     if (!term) return this;

// // //     const textStage = { $text: { $search: term } };

// // //     // If using aggregate & model has text index, use $text
// // //     if (this.isAggregate && this.query.model) {
// // //       try {
// // //         this.query.pipeline().push({ $match: textStage });
// // //         return this;
// // //       } catch (_) {}
// // //     }

// // //     // fallback fuzzy regex
// // //     const regex = { $regex: term, $options: "i" };
// // //     const conds = [];

// // //     if (fields.length) {
// // //       fields.forEach(f => conds.push({ [f]: regex }));
// // //     } else {
// // //       const schema = this.query.model?.schema?.obj;
// // //       if (schema) {
// // //         for (const k in schema) {
// // //           if (schema[k] === String || schema[k].type === String) {
// // //             conds.push({ [k]: regex });
// // //           }
// // //         }
// // //       }
// // //     }

// // //     if (!conds.length) return this;

// // //     if (this.isAggregate) {
// // //       this.query.pipeline().push({ $match: { $or: conds } });
// // //     } else {
// // //       this.query = this.query.find({ $or: conds });
// // //     }

// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * SORTING
// // //    * -------------------------------------------------------------
// // //    */
// // //   sort() {
// // //     const s = this.queryString.sort;
// // //     const sortStage = s ? s.split(",").join(" ") : "-createdAt -_id";

// // //     if (this.isAggregate) {
// // //       this.query.pipeline().push({ $sort: this._parseSort(sortStage) });
// // //     } else {
// // //       this.query = this.query.sort(sortStage);
// // //     }
// // //     return this;
// // //   }

// // //   _parseSort(sortStr) {
// // //     const parsed = {};
// // //     sortStr.split(" ").forEach(field => {
// // //       field = field.trim();
// // //       if (!field) return;
// // //       parsed[field.replace("-", "")] = field.startsWith("-") ? -1 : 1;
// // //     });
// // //     return parsed;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * FIELD LIMITING
// // //    * -------------------------------------------------------------
// // //    */
// // //   limitFields() {
// // //     const f = this.queryString.fields;
// // //     if (!f) return this;

// // //     const fields = f.split(",").join(" ");
// // //     if (this.isAggregate) {
// // //       const proj = {};
// // //       f.split(",").forEach(field => proj[field] = 1);
// // //       this.query.pipeline().push({ $project: proj });
// // //     } else {
// // //       this.query = this.query.select(fields);
// // //     }

// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * CURSOR PAGINATION
// // //    * ?lastId=...
// // //    * ?lastDate=...
// // //    * -------------------------------------------------------------
// // //    */
// // //   cursorPaginate() {
// // //     const lastId = this.queryString.lastId;
// // //     const lastDate = this.queryString.lastDate;

// // //     if (!lastId && !lastDate) return this;

// // //     const cond = [];

// // //     if (lastDate) {
// // //       cond.push({ date: { $lt: new Date(lastDate) } });
// // //     }
// // //     if (lastId) {
// // //       cond.push({ _id: { $lt: new mongoose.Types.ObjectId(lastId) } });
// // //     }

// // //     if (this.isAggregate) {
// // //       this.query.pipeline().push({ $match: { $or: cond } });
// // //     } else {
// // //       this.query = this.query.find({ $or: cond });
// // //     }

// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * PAGE/LIMIT PAGINATION
// // //    * -------------------------------------------------------------
// // //    */
// // //   paginate() {
// // //     const page = Number(this.queryString.page) || 1;
// // //     const limit = Number(this.queryString.limit) || 50;
// // //     const skip = (page - 1) * limit;

// // //     this.pagination = { page, limit, skip };

// // //     if (this.isAggregate) {
// // //       this.query.pipeline().push({ $skip: skip }, { $limit: limit });
// // //     } else {
// // //       this.query = this.query.skip(skip).limit(limit);
// // //     }

// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * POPULATE
// // //    * -------------------------------------------------------------
// // //    */
// // //   populate(map = {}) {
// // //     if (!this.queryString.populate) return this;

// // //     const fields = this.queryString.populate.split(",");
// // //     fields.forEach(f => {
// // //       if (!this.isAggregate) {
// // //         this.query = this.query.populate({
// // //           path: f,
// // //           select: map[f] || "-__v"
// // //         });
// // //       }
// // //     });
// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * EXECUTE
// // //    * -------------------------------------------------------------
// // //    */
// // //   async execute() {
// // //     if (this.isAggregate) {
// // //       const data = await this.query.exec();
// // //       return { data, results: data.length };
// // //     }

// // //     const docs = await this.query;
// // //     const count = await this.query.model.countDocuments(this.query.getFilter());

// // //     const pages = Math.ceil(count / this.pagination.limit || 1);

// // //     return {
// // //       data: docs,
// // //       results: docs.length,
// // //       total: count,
// // //       pagination: {
// // //         ...this.pagination,
// // //         total: count,
// // //         pages,
// // //         hasNext: this.pagination.page < pages,
// // //         hasPrev: this.pagination.page > 1
// // //       }
// // //     };
// // //   }
// // // }

// // // module.exports = ApiFeatures;