const mongoose = require("mongoose");

class ApiFeatures {
  constructor(query, queryString, isAggregate = false) {
    this.query = query;
    this.queryString = queryString;
    this.isAggregate = isAggregate;

    this.baseFilter = {};       // used to preserve factory filters
    this.pagination = {};
  }

  /************************************************************
   * BASE FILTER SUPPORT (CRITICAL FIX)
   ************************************************************/
  setBaseFilter(filterObj = {}) {
    this.baseFilter = filterObj;
    return this;
  }

  /************************************************************
   * TYPE COERCION
   ************************************************************/
  static coerceValue(value) {
    if (typeof value !== "string") return value;

    if (value === "true" || value === "false") return value === "true";
    if (!isNaN(value)) return Number(value);
    if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);

    const d = new Date(value);
    if (!isNaN(d)) return d;

    return value;
  }

  /************************************************************
   * ADVANCED FILTERING WITH OR / IN / RANGE
   ************************************************************/
  filter() {
    const q = { ...this.queryString };
    const excluded = ["page", "limit", "sort", "fields", "search", "populate", "lastId", "lastDate"];
    excluded.forEach(f => delete q[f]);

    const match = { ...this.baseFilter }; // <-- CRITICAL LINE
    const or = [];

    for (const key in q) {
      const value = q[key];

      // OR: field[or]=a,b,c
      if (key.endsWith("[or]")) {
        const field = key.replace("[or]", "");
        const arr = value.split(",").map(v => ApiFeatures.coerceValue(v.trim()));
        or.push({ [field]: { $in: arr } });
        continue;
      }

      // IN via pipe → a|b|c
      if (typeof value === "string" && value.includes("|")) {
        match[key] = { $in: value.split("|").map(v => ApiFeatures.coerceValue(v.trim())) };
        continue;
      }

      // Range operators
      if (typeof value === "object" && value !== null) {
        match[key] = {};
        for (const op in value) {
          match[key][`$${op}`] = ApiFeatures.coerceValue(value[op]);
        }
        continue;
      }

      // Default
      match[key] = ApiFeatures.coerceValue(value);
    }

    // soft delete enforcement unless user overrides
    if (this.query.model?.schema?.path("isDeleted") && match.isDeleted === undefined) {
      match.isDeleted = { $ne: true };
    }

    if (this.isAggregate) {
      this.query.pipeline().push({ $match: match });
      if (or.length) this.query.pipeline().push({ $match: { $or: or } });
    } else {
      this.query = this.query.find(match);
      if (or.length) this.query = this.query.find({ $or: or });
    }

    return this;
  }

  /************************************************************
   * SEARCH / TEXT
   ************************************************************/
  search(fields = []) {
    const term = this.queryString.search;
    if (!term) return this;

    const textMatch = { $text: { $search: term } };

    // text search for indexed fields
    if (this.isAggregate) {
      this.query.pipeline().push({ $match: textMatch });
      return this;
    }

    // fallback regex search
    const regex = { $regex: term, $options: "i" };

    const conds = [];
    if (fields.length) {
      fields.forEach(f => conds.push({ [f]: regex }));
    }

    if (conds.length) {
      this.query = this.query.find({ $or: conds });
    }

    return this;
  }

  /************************************************************
   * SORTING
   ************************************************************/
  sort() {
    const s = this.queryString.sort
      ? this.queryString.sort.split(",").join(" ")
      : "-createdAt -_id";

    if (this.isAggregate) {
      const parsed = {};
      s.split(" ").forEach(f => {
        parsed[f.replace("-", "")] = f.startsWith("-") ? -1 : 1;
      });
      this.query.pipeline().push({ $sort: parsed });
    } else {
      this.query = this.query.sort(s);
    }

    return this;
  }

  /************************************************************
   * FIELDS LIMITING
   ************************************************************/
  limitFields() {
    const f = this.queryString.fields;
    if (!f) return this;

    if (this.isAggregate) {
      const proj = {};
      f.split(",").forEach(field => proj[field] = 1);
      this.query.pipeline().push({ $project: proj });
    } else {
      this.query = this.query.select(f.split(",").join(" "));
    }

    return this;
  }

  /************************************************************
   * CURSOR PAGINATION
   ************************************************************/
  cursorPaginate() {
    const lastId = this.queryString.lastId;
    const lastDate = this.queryString.lastDate;

    if (!lastId && !lastDate) return this;

    const cond = {};

    if (lastDate) cond.date = { $lt: new Date(lastDate) };
    if (lastId) cond._id = { $lt: new mongoose.Types.ObjectId(lastId) };

    if (this.isAggregate) {
      this.query.pipeline().push({ $match: cond });
    } else {
      this.query = this.query.find(cond);
    }

    return this;
  }

  /************************************************************
   * PAGE / LIMIT PAGINATION
   ************************************************************/
  paginate() {
    const page = Number(this.queryString.page) || 1;
    const limit = Number(this.queryString.limit) || 50;
    const skip = (page - 1) * limit;

    this.pagination = { page, limit, skip };

    if (this.isAggregate) {
      this.query.pipeline().push({ $skip: skip }, { $limit: limit });
    } else {
      this.query = this.query.skip(skip).limit(limit);
    }

    return this;
  }

  /************************************************************
   * POPULATE
   ************************************************************/
  populate(map = {}) {
    if (!this.queryString.populate || this.isAggregate) return this;

    const fields = this.queryString.populate.split(",");
    fields.forEach(f => {
      this.query = this.query.populate({
        path: f,
        select: map[f] || "-__v"
      });
    });

    return this;
  }

  /************************************************************
   * EXECUTE
   ************************************************************/
  async execute() {
    if (this.isAggregate) {
      const data = await this.query.exec();
      return { data, results: data.length };
    }

    const docs = await this.query;
    const count = await this.query.model.countDocuments(this.baseFilter);

    const pages = Math.ceil(count / this.pagination.limit);

    return {
      data: docs,
      results: docs.length,
      total: count,
      pagination: {
        ...this.pagination,
        total: count,
        pages,
        hasNext: this.pagination.page < pages,
        hasPrev: this.pagination.page > 1
      }
    };
  }
}

module.exports = ApiFeatures;


// /**
//  * -------------------------------------------------------------
//  * ApiFeatures Utility - Enhanced Version
//  * -------------------------------------------------------------
//  * A universal Mongoose query builder that supports:
//  * ✅ Filtering (with advanced operators)
//  * ✅ Sorting
//  * ✅ Field limiting
//  * ✅ Pagination (with metadata)
//  * ✅ Multi-value queries (comma-separated)
//  * ✅ Regex search
//  * ✅ Soft-delete safe queries
//  * ✅ Nested field access
//  * ✅ Date range queries
//  * ✅ Exclude fields
//  * -------------------------------------------------------------
//  */

// class ApiFeatures {
//   constructor(query, queryString) {
//     this.query = query; // Mongoose query (e.g., Model.find())
//     this.queryString = queryString; // Express req.query
//     this.pagination = {}; // Metadata for pagination
//     this.total = 0; // Total documents count
//   }

//   /**
//    * -------------------------------------------------------------
//    * ADVANCED FILTERING
//    * Supports:
//    * - price[gte]=100&price[lte]=500 (range queries)
//    * - status=active,inactive (multi-value)
//    * - name=john (regex search for strings)
//    * - "address.city"="New York" (nested fields)
//    * - date[gte]=2024-01-01&date[lte]=2024-12-31 (date ranges)
//    * -------------------------------------------------------------
//    */
//   filter() {
//     const queryObj = { ...this.queryString };
//     const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
//     excludedFields.forEach((el) => delete queryObj[el]);

//     const mongoQuery = {};

//     for (const key in queryObj) {
//       if (!Object.hasOwn(queryObj, key)) continue;
//       const value = queryObj[key];
//       const schemaType = this.query.model.schema.path(key)?.instance;

//       // 1️⃣ Handle multi-value fields (e.g., status=active,inactive)
//       if (typeof value === 'string' && value.includes(',')) {
//         mongoQuery[key] = { $in: value.split(',').map((v) => v.trim()) };
//       }
      
//       // 2️⃣ Handle object operators (gte, lte, gt, lt, ne, regex, options)
//       else if (typeof value === 'object' && value !== null) {
//         mongoQuery[key] = {};
//         for (const op in value) {
//           if (['gte', 'gt', 'lte', 'lt', 'ne', 'eq'].includes(op)) {
//             mongoQuery[key]['$' + op] = value[op];
//           } else if (op === 'regex') {
//             mongoQuery[key]['$regex'] = value[op];
//           } else if (op === 'options') {
//             mongoQuery[key]['$options'] = value[op];
//           }
//         }
//       }
      
//       // 3️⃣ Handle boolean values (true/false strings)
//       else if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) {
//         mongoQuery[key] = value.toLowerCase() === 'true';
//       }
      
//       // 4️⃣ Handle string values with regex (for search)
//       else if (typeof value === 'string' && schemaType === 'String') {
//         mongoQuery[key] = { $regex: value, $options: 'i' };
//       }
      
//       // 5️⃣ Handle nested fields safely (e.g., "address.city"="Delhi")
//       else if (key.includes('.')) {
//         mongoQuery[key] = value;
//       }
      
//       // 6️⃣ Handle date strings (convert to Date objects)
//       else if (typeof value === 'string' && schemaType === 'Date') {
//         const date = new Date(value);
//         if (!isNaN(date)) {
//           mongoQuery[key] = date;
//         } else {
//           mongoQuery[key] = value;
//         }
//       }
      
//       // 7️⃣ Fallback to exact match (ObjectIds, numbers, etc.)
//       else {
//         mongoQuery[key] = value;
//       }
//     }

//     // Exclude soft-deleted records by default if schema supports it
//     if (this.query.model.schema.path('isDeleted')) {
//       mongoQuery.isDeleted = { $ne: true };
//     }

//     // Exclude inactive records by default if schema supports it
//     if (this.query.model.schema.path('isActive')) {
//       mongoQuery.isActive = { $ne: false };
//     }

//     this.query = this.query.find(mongoQuery);
//     return this;
//   }

//   /**
//    * -------------------------------------------------------------
//    * FULL-TEXT SEARCH
//    * Example: ?search=keyword
//    * Searches in predefined fields or all string fields
//    * -------------------------------------------------------------
//    */
//   search(searchFields = ['name', 'title', 'description']) {
//     if (this.queryString.search) {
//       const searchTerm = this.queryString.search;
//       const searchConditions = [];

//       searchFields.forEach(field => {
//         searchConditions.push({
//           [field]: { $regex: searchTerm, $options: 'i' }
//         });
//       });

//       // If there are existing query conditions, use $and
//       const currentQuery = this.query.getFilter();
//       if (Object.keys(currentQuery).length > 0) {
//         this.query = this.query.find({
//           $and: [
//             currentQuery,
//             { $or: searchConditions }
//           ]
//         });
//       } else {
//         this.query = this.query.find({ $or: searchConditions });
//       }
//     }
//     return this;
//   }

//   /**
//    * -------------------------------------------------------------
//    * SORTING
//    * Example:
//    * ?sort=price,-createdAt (ascending price, descending createdAt)
//    * -------------------------------------------------------------
//    */
//   sort() {
//     if (this.queryString.sort) {
//       const sortBy = this.queryString.sort.split(',').join(' ');
//       this.query = this.query.sort(sortBy);
//     } else {
//       // Default sort by newest first
//       this.query = this.query.sort('-createdAt _id');
//     }
//     return this;
//   }

//   /**
//    * -------------------------------------------------------------
//    * FIELD LIMITING
//    * Example:
//    * ?fields=name,price,category (include only these)
//    * ?fields=-password,-__v (exclude these)
//    * -------------------------------------------------------------
//    */
//   limitFields() {
//     if (this.queryString.fields) {
//       const fields = this.queryString.fields.split(',').join(' ');
//       this.query = this.query.select(fields);
//     } else {
//       // Default exclude internal fields
//       const defaultExcludes = '-__v -createdAt -updatedAt -isDeleted';
//       this.query = this.query.select(defaultExcludes);
//     }
//     return this;
//   }

//   /**
//    * -------------------------------------------------------------
//    * PAGINATION WITH METADATA
//    * Example: ?page=2&limit=10
//    * Returns pagination metadata for frontend
//    * -------------------------------------------------------------
//    */
//   paginate() {
//     const page = parseInt(this.queryString.page, 10) || 1;
//     const limit = parseInt(this.queryString.limit, 10) || 20;
//     const skip = (page - 1) * limit;

//     this.query = this.query.skip(skip).limit(limit);
    
//     this.pagination = {
//       page,
//       limit,
//       skip,
//       hasNext: false,
//       hasPrev: page > 1
//     };

//     return this;
//   }

//   /**
//    * -------------------------------------------------------------
//    * GET PAGINATION METADATA
//    * Call this after executing the query
//    * -------------------------------------------------------------
//    */
//   async getPaginationMetadata() {
//     const totalCount = await this.query.model.countDocuments(this.query.getFilter());
//     const totalPages = Math.ceil(totalCount / this.pagination.limit);
    
//     this.pagination.total = totalCount;
//     this.pagination.pages = totalPages;
//     this.pagination.hasNext = this.pagination.page < totalPages;
    
//     return this.pagination;
//   }

//   /**
//    * -------------------------------------------------------------
//    * POPULATE RELATIONS
//    * Example: ?populate=category,author
//    * -------------------------------------------------------------
//    */
//   populate(populateOptions = {}) {
//     if (this.queryString.populate) {
//       const populateFields = this.queryString.populate.split(',');
//       populateFields.forEach(field => {
//         this.query = this.query.populate({
//           path: field,
//           select: populateOptions[field] || '-__v'
//         });
//       });
//     }
//     return this;
//   }

//   /**
//    * -------------------------------------------------------------
//    * EXECUTE QUERY WITH ALL FEATURES
//    * Convenience method to apply all features at once
//    * -------------------------------------------------------------
//    */
//   async execute() {
//     const docs = await this.query;
//     const pagination = await this.getPaginationMetadata();
    
//     return {
//       data: docs,
//       pagination,
//       total: pagination.total,
//       results: docs.length
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
// // //  * ApiFeatures Utility
// // //  * -------------------------------------------------------------
// // //  * A universal Mongoose query builder that supports:
// // //  * ✅ Filtering
// // //  * ✅ Sorting
// // //  * ✅ Field limiting
// // //  * ✅ Pagination
// // //  * ✅ Muti-value queries
// // //  * ✅ Regex search
// // //  * ✅ Soft-delete safe queries
// // //  * ✅ Nested field access
// // //  * -------------------------------------------------------------
// // //  */

// // // class ApiFeatures {
// // //   constructor(query, queryString) {
// // //     this.query = query;           // Mongoose query (e.g., Model.find())
// // //     this.queryString = queryString; // Express req.query
// // //     this.pagination = {};         // Metadata for frontend pagination
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * FILTERING
// // //    * Example:
// // //    * ?price[gte]=100&price[lte]=500&status=active,inactive
// // //    * -------------------------------------------------------------
// // //    */
// // //   filter() {
// // //     const queryObj = { ...this.queryString };
// // //     const excludedFields = ['page', 'sort', 'limit', 'fields'];
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

// // //       // 2️⃣ Handle numeric operators (gte, lte, gt, lt)
// // //       else if (typeof value === 'object' && value !== null) {
// // //         mongoQuery[key] = {};
// // //         for (const op in value) {
// // //           if (['gte', 'gt', 'lte', 'lt'].includes(op)) {
// // //             mongoQuery[key]['$' + op] = value[op];
// // //           }
// // //         }
// // //       }

// // //       // 3️⃣ Handle string values with regex (for search)
// // //       else if (typeof value === 'string' && schemaType === 'String') {
// // //         mongoQuery[key] = { $regex: value, $options: 'i' };
// // //       }

// // //       // 4️⃣ Handle nested fields safely (e.g., address.city=Delhi)
// // //       else if (key.includes('.')) {
// // //         mongoQuery[key] = value;
// // //       }

// // //       // 5️⃣ Fallback to exact match (ObjectIds, numbers, etc.)
// // //       else {
// // //         mongoQuery[key] = value;
// // //       }
// // //     }

// // //     // Exclude soft-deleted records by default if schema supports it
// // //     if (this.query.model.schema.path('isDeleted')) {
// // //       mongoQuery.isDeleted = { $ne: true };
// // //     }

// // //     this.query = this.query.find(mongoQuery);
// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * SORTING
// // //    * Example:
// // //    * ?sort=price,-createdAt
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
// // //    * ?fields=name,price,category
// // //    * -------------------------------------------------------------
// // //    */
// // //   limitFields() {
// // //     if (this.queryString.fields) {
// // //       const fields = this.queryString.fields.split(',').join(' ');
// // //       this.query = this.query.select(fields);
// // //     } else {
// // //       // Default exclude internal fields
// // //       this.query = this.query.select('-__v -isDeleted');
// // //     }
// // //     return this;
// // //   }

// // //   /**
// // //    * -------------------------------------------------------------
// // //    * PAGINATION
// // //    * Example:
// // //    * ?page=2&limit=10
// // //    * -------------------------------------------------------------
// // //    */
// // //   paginate() {
// // //     const page = parseInt(this.queryString.page, 10) || 1;
// // //     const limit = parseInt(this.queryString.limit, 10) || 20;
// // //     const skip = (page - 1) * limit;

// // //     this.query = this.query.skip(skip).limit(limit);
// // //     this.pagination = { page, limit, skip };

// // //     return this;
// // //   }
// // // }

// // // module.exports = ApiFeatures;


// // // // class ApiFeatures {
// // // //     constructor(query, queryString) {
// // // //         this.query = query; // Mongoose query object (e.g., Product.find())
// // // //         this.queryString = queryString; // From Express (req.query)
// // // //     }

// // // //     /**
// // // //      * Filters the query based on the query string.
// // // //      * Handles operators like [gte], [gt], [lte], [lt], [regex], [options].
// // // //      * Example URL: /api/products?price[gte]=100&name[regex]=phone
// // // //      */
// // // // //   filter() {
// // // // //     const queryObj = { ...this.queryString };

// // // // //     // remove reserved params
// // // // //     const excludedFields = ['page', 'sort', 'limit', 'fields'];
// // // // //     excludedFields.forEach(el => delete queryObj[el]);

// // // // //     // build Mongo filter
// // // // //     const mongoFilter = {};

// // // // //     Object.keys(queryObj).forEach(key => {
// // // // //         const val = queryObj[key];

// // // // //         // Handle advanced query operators (gte, lte etc.)
// // // // //         if (typeof val === 'object') {
// // // // //             // Example: price[gte]=100
// // // // //             mongoFilter[key] = {};
// // // // //             Object.keys(val).forEach(op => {
// // // // //                 mongoFilter[key][`$${op}`] = val[op];
// // // // //             });
// // // // //         } else {
// // // // //             // For plain strings → convert to regex for partial match
// // // // //             if (isNaN(val)) {
// // // // //                 mongoFilter[key] = { $regex: val, $options: 'i' };
// // // // //             } else {
// // // // //                 mongoFilter[key] = val; // keep numbers as-is
// // // // //             }
// // // // //         }
// // // // //     });

// // // // //     this.query = this.query.find(mongoFilter);
// // // // //     return this;
// // // // // }
// // // // filter() {
// // // //     const queryObj = { ...this.queryString };
// // // //     const excludedFields = ['page', 'sort', 'limit', 'fields'];
// // // //     excludedFields.forEach(el => delete queryObj[el]);

// // // //     const mongoQuery = {};

// // // //     for (const key in queryObj) {
// // // //         if (!queryObj.hasOwnProperty(key)) continue;

// // // //         const value = queryObj[key];

// // // //         // If numeric operators exist
// // // //         if (typeof value === 'object' && value !== null) {
// // // //             mongoQuery[key] = {};
// // // //             for (const op in value) {
// // // //                 if (['gte','gt','lte','lt'].includes(op)) {
// // // //                     mongoQuery[key]['$' + op] = value[op];
// // // //                 }
// // // //             }
// // // //         } 
// // // //         // Only apply regex for string fields in schema
// // // //         else if (typeof value === 'string' && this.query.model.schema.path(key)?.instance === 'String') {
// // // //             mongoQuery[key] = { $regex: value, $options: 'i' };
// // // //         } 
// // // //         // Otherwise exact match (e.g., ObjectId)
// // // //         else {
// // // //             mongoQuery[key] = value;
// // // //         }
// // // //     }

// // // //     this.query = this.query.find(mongoQuery);
// // // //     return this;
// // // // }


// // // // // ------version 1
// // // //     // filter() {
// // // //     //     // 1. Create a shallow copy of the query string
// // // //     //     const queryObj = { ...this.queryString };

// // // //     //     // 2. Exclude special fields used for other features
// // // //     //     const excludedFields = ['page', 'sort', 'limit', 'fields'];
// // // //     //     excludedFields.forEach(el => delete queryObj[el]);

// // // //     //     // 3. Convert to a JSON string to replace operators with MongoDB format ($gte, $gt, etc.)
// // // //     //     let queryStr = JSON.stringify(queryObj);
// // // //     //     queryStr = queryStr.replace(/\b(gte|gt|lte|lt|regex|options)\b/g, match => `$${match}`);

// // // //     //     // 4. Apply the filter to the Mongoose query
// // // //     //     this.query = this.query.find(JSON.parse(queryStr));

// // // //     //     return this; // Return 'this' to allow chaining
// // // //     // }

   
// // // //     sort() {
// // // //         if (this.queryString.sort) {
// // // //             const sortBy = this.queryString.sort.split(',').join(' ');
// // // //             this.query = this.query.sort(sortBy);
// // // //         } else {
// // // //             // Default sort if none is provided
// // // //             this.query = this.query.sort('-createdAt');
// // // //         }
// // // //         return this;
// // // //     }

// // // //     /**
// // // //      * Limits the fields returned in the results.
// // // //      * Example URL: /api/products?fields=name,price,description
// // // //      */
// // // //     limitFields() {
// // // //         if (this.queryString.fields) {
// // // //             const fields = this.queryString.fields.split(',').join(' ');
// // // //             this.query = this.query.select(fields);
// // // //         } else {
// // // //             // By default, exclude the '__v' field from Mongoose
// // // //             this.query = this.query.select('-__v');
// // // //         }
// // // //         return this;
// // // //     }

// // // //     /**
// // // //      * Paginates the results.
// // // //      * Example URL: /api/products?page=2&limit=10
// // // //      */
// // // //     paginate() {
// // // //         const page = parseInt(this.queryString.page, 10) || 1;
// // // //         const limit = parseInt(this.queryString.limit, 10) || 100;
// // // //         const skip = (page - 1) * limit;

// // // //         this.query = this.query.skip(skip).limit(limit);
// // // //         return this;
// // // //     }
// // // // }

// // // // module.exports = ApiFeatures;

// // // // // class ApiFeatures {
// // // // //   constructor(query, queryString) {
// // // // //     if (!queryString || typeof queryString !== 'object') {
// // // // //       throw new Error('Query string must be a valid object');
// // // // //     }
// // // // //     this.query = query;
// // // // //     this.queryString = queryString;
// // // // //   }

// // // // //   filter() {
// // // // //     if (!this.query) {
// // // // //       this.query = {}; // Initialize as an empty object if not already defined
// // // // //     }

// // // // //     // Handle nested filter object
// // // // //     let filterObj = {};
// // // // //     if (this.queryString.filter) {
// // // // //       filterObj = { ...this.queryString.filter };
// // // // //     } else {
// // // // //       // If no filter object, use the entire queryString
// // // // //       filterObj = { ...this.queryString };
// // // // //     }

// // // // //     // Remove pagination, sorting, and field limiting parameters
// // // // //     const excludedFields = ['page', 'sort', 'limit', 'fields', 'filter'];
// // // // //     excludedFields.forEach((el) => delete filterObj[el]);

// // // // //     // Handle empty filter object
// // // // //     if (Object.keys(filterObj).length === 0) {
// // // // //       this.query = this.query.find({});
// // // // //       return this;
// // // // //     }

// // // // //     // Process each field in the filter
// // // // //     Object.keys(filterObj).forEach((key) => {
// // // // //       const value = filterObj[key];
      
// // // // //       // Handle regex search
// // // // //       if (value && typeof value === 'object' && value.regex) {
// // // // //         filterObj[key] = { $regex: value.regex, $options: 'i' };
// // // // //       }
// // // // //       // Handle numeric comparisons
// // // // //       else if (value && typeof value === 'object') {
// // // // //         const operators = ['gte', 'gt', 'lte', 'lt', 'ne', 'in', 'nin'];
// // // // //         operators.forEach(op => {
// // // // //           if (value[op] !== undefined) {
// // // // //             filterObj[key] = { ...filterObj[key], [`$${op}`]: value[op] };
// // // // //           }
// // // // //         });
// // // // //       }
// // // // //       // Handle array values
// // // // //       else if (Array.isArray(value)) {
// // // // //         filterObj[key] = { $in: value };
// // // // //       }
// // // // //       // Handle comma-separated string values
// // // // //       else if (typeof value === 'string' && value.includes(',')) {
// // // // //         filterObj[key] = { $in: value.split(',').map(item => item.trim()) };
// // // // //       }
// // // // //       // // Handle nested queries
// // // // //       // if (key.includes('.')) {
// // // // //       //   const nestedKeys = key.split('.');
// // // // //       //   let tempQuery = filterObj;
// // // // //       //   for (let i = 0; i < nestedKeys.length - 1; i++) {
// // // // //       //     tempQuery = tempQuery[nestedKeys[i]] = tempQuery[nestedKeys[i]] || {};
// // // // //       //   }
// // // // //       //   tempQuery[nestedKeys[nestedKeys.length - 1]] = filterObj[key];
// // // // //       //   delete filterObj[key];
// // // // //       // }
// // // // //       if (key.includes('.')) {
// // // // //         const nestedKeys = key.split('.');
// // // // //         let tempQuery = filterObj;
// // // // //         for (let i = 0; i < nestedKeys.length - 1; i++) {
// // // // //           tempQuery = tempQuery[nestedKeys[i]] = tempQuery[nestedKeys[i]] || {};
// // // // //         }
// // // // //         tempQuery[nestedKeys[nestedKeys.length - 1]] = value; // use original value
// // // // //         delete filterObj[key];
// // // // //       } else {
// // // // //         filterObj[key] = value; // set it only if not nested
// // // // //       }
      
// // // // //     });

// // // // //     this.query = this.query.find(filterObj);
// // // // //     return this;
// // // // //   }

// // // // //   sort() {
// // // // //     if (this.queryString.sort) {
// // // // //       const sortBy = this.queryString.sort.split(',').join(' ').trim();
// // // // //       this.query = this.query.sort(sortBy || '-createdAt');
// // // // //     } else {
// // // // //       this.query = this.query.sort('-createdAt');
// // // // //     }
// // // // //     return this;
// // // // //   }

// // // // //   limitFields() {
// // // // //     if (this.queryString.fields) {
// // // // //       const fields = this.queryString.fields.split(',').join(' ').trim();
// // // // //       this.query = this.query.select(fields || '-__v');
// // // // //     } else {
// // // // //       this.query = this.query.select('-__v');
// // // // //     }
// // // // //     return this;
// // // // //   }

// // // // //   paginate() {
// // // // //     const page = Math.max(parseInt(this.queryString.page, 10) || 1, 1);
// // // // //     const limit = Math.min(Math.max(parseInt(this.queryString.limit, 10) || 200, 1), 1000);
// // // // //     const skip = (page - 1) * limit;

// // // // //     if (skip < 0) {
// // // // //       throw new Error('Invalid page number');
// // // // //     }
// // // // //     this.query = this.query.skip(skip).limit(limit);
// // // // //     return this;
// // // // //   }
// // // // // }

// // // // // module.exports = ApiFeatures;
// // // ///////////////////////////////////////////////////////////////////////////////////////////////
// // const mongoose = require("mongoose");

// // /**
// //  * -------------------------------------------------------------
// //  * ApiFeatures (Enterprise Edition)
// //  * -------------------------------------------------------------
// //  * Supports:
// //  *  ✓ Advanced Filtering
// //  *  ✓ Nested AND / OR / IN / RANGE
// //  *  ✓ Soft delete enforcement
// //  *  ✓ Regex & fuzzy search
// //  *  ✓ Text index search
// //  *  ✓ Populate mapping
// //  *  ✓ Pagination (page/limit)
// //  *  ✓ Cursor pagination (lastId, lastDate)
// //  *  ✓ Sorting
// //  *  ✓ Field limiting
// //  *  ✓ Numeric/Date/ObjectId coercion
// //  *  ✓ Aggregation mode
// //  * -------------------------------------------------------------
// //  */

// // class ApiFeatures {
// //   constructor(query, queryString, isAggregate = false) {
// //     this.query = query;                     // Mongoose query or aggregate
// //     this.queryString = queryString;         // req.query
// //     this.isAggregate = isAggregate;         // true when using aggregation pipelines
// //     this.pagination = {};
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * COERCION UTILITIES
// //    * -------------------------------------------------------------
// //    */
// //   static coerceValue(value) {
// //     if (typeof value !== "string") return value;

// //     if (value === "true" || value === "false") return value === "true";

// //     if (!isNaN(value)) return Number(value);

// //     if (mongoose.Types.ObjectId.isValid(value))
// //       return new mongoose.Types.ObjectId(value);

// //     const date = new Date(value);
// //     if (!isNaN(date)) return date;

// //     return value;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * ADVANCED FILTERING WITH NESTED OR
// //    * -------------------------------------------------------------
// //    * Support:
// //    *   field=a|b|c              → $in
// //    *   field[or]=a,b,c          → nested OR
// //    *   (a=1 & b=2) | (c=3)       → custom OR groups
// //    */
// //   // filter() {
// //   //   const q = { ...this.queryString };

// //   //   const excluded = ["page", "limit", "sort", "fields", "search", "populate", "cursor", "lastId", "lastDate"];
// //   //   excluded.forEach(f => delete q[f]);

// //   //   const mongo = {};
// //   //   const or = [];

// //   //   for (const rawKey in q) {
// //   //     const key = rawKey.trim();
// //   //     const value = q[key];

// //   //     // OR group handler: field[or]=a,b,c
// //   //     if (key.endsWith("[or]")) {
// //   //       const actualKey = key.replace("[or]", "");
// //   //       const arr = value.split(",").map(v => ApiFeatures.coerceValue(v.trim()));
// //   //       or.push({ [actualKey]: { $in: arr } });
// //   //       continue;
// //   //     }

// //   //     // Standard OR via pipe: field=a|b|c
// //   //     if (typeof value === "string" && value.includes("|")) {
// //   //       mongo[key] = { $in: value.split("|").map(v => ApiFeatures.coerceValue(v.trim())) };
// //   //       continue;
// //   //     }

// //   //     // Multi-value
// //   //     if (typeof value === "string" && value.includes(",")) {
// //   //       mongo[key] = { $in: value.split(",").map(v => ApiFeatures.coerceValue(v.trim())) };
// //   //       continue;
// //   //     }

// //   //     // Range operators: price[gte], date[lte]
// //   //     if (typeof value === "object" && value !== null) {
// //   //       mongo[key] = {};
// //   //       for (const op in value) {
// //   //         mongo[key][`$${op}`] = ApiFeatures.coerceValue(value[op]);
// //   //       }
// //   //       continue;
// //   //     }

// //   //     // Nested field
// //   //     if (key.includes(".")) {
// //   //       mongo[key] = ApiFeatures.coerceValue(value);
// //   //       continue;
// //   //     }

// //   //     mongo[key] = ApiFeatures.coerceValue(value);
// //   //   }

// //   //   // soft delete enforcement
// //   //   if (this.query.model?.schema?.path("isDeleted")) {
// //   //     mongo.isDeleted = { $ne: true };
// //   //   }

// //   //   const finalQuery = Object.keys(mongo).length ? [{ $match: mongo }] : [];

// //   //   if (or.length) {
// //   //     finalQuery.push({ $match: { $or: or } });
// //   //   }

// //   //   if (this.isAggregate) {
// //   //     this.query.pipeline().push(...finalQuery);
// //   //   } else {
// //   //     const match = finalQuery.length ? finalQuery[0]["$match"] : {};
// //   //     this.query = this.query.find(match);
// //   //   }

// //   //   return this;
// //   // }
// // filter() {
// //     const q = { ...this.queryString };

// //     const excluded = ["page", "limit", "sort", "fields", "search", "populate", "cursor", "lastId", "lastDate"];
// //     excluded.forEach(f => delete q[f]);

// //     const mongo = {};
// //     const or = [];

// //     for (const rawKey in q) {
// //       const key = rawKey.trim();
// //       const value = q[key];

// //       if (key.endsWith("[or]")) {
// //         const actualKey = key.replace("[or]", "");
// //         const arr = value.split(",").map(v => ApiFeatures.coerceValue(v.trim()));
// //         or.push({ [actualKey]: { $in: arr } });
// //         continue;
// //       }

// //       if (typeof value === "string" && value.includes("|")) {
// //         mongo[key] = { $in: value.split("|").map(v => ApiFeatures.coerceValue(v.trim())) };
// //         continue;
// //       }

// //       if (typeof value === "object" && value !== null) {
// //         mongo[key] = {};
// //         for (const op in value) {
// //           mongo[key][`$${op}`] = ApiFeatures.coerceValue(value[op]);
// //         }
// //         continue;
// //       }

// //       mongo[key] = ApiFeatures.coerceValue(value);
// //     }

// //     // 1. Get existing filters (like organizationId from Factory)
// //     const existingFilters = this.isAggregate ? {} : this.query.getFilter();
    
// //     // 2. Merge existing filters with new mongo filters
// //     const combinedMatch = { ...existingFilters, ...mongo };

// //     // 3. Handle soft delete only if not already explicitly queried
// //     if (this.query.model?.schema?.path("isDeleted") && combinedMatch.isDeleted === undefined) {
// //       combinedMatch.isDeleted = { $ne: true };
// //     }

// //     if (this.isAggregate) {
// //       const stages = [];
// //       if (Object.keys(combinedMatch).length) stages.push({ $match: combinedMatch });
// //       if (or.length) stages.push({ $match: { $or: or } });
// //       this.query.pipeline().push(...stages);
// //     } else {
// //       // FIX: Apply the merged filters
// //       this.query = this.query.find(combinedMatch);
// //       if (or.length) {
// //         this.query = this.query.find({ $or: or });
// //       }
// //     }

// //     return this;
// //   }
// //   /**
// //    * -------------------------------------------------------------
// //    * SEARCH + FUZZY + TEXT INDEX
// //    * -------------------------------------------------------------
// //    */
// //   search(fields = []) {
// //     const term = this.queryString.search;
// //     if (!term) return this;

// //     const textStage = { $text: { $search: term } };

// //     // If using aggregate & model has text index, use $text
// //     if (this.isAggregate && this.query.model) {
// //       try {
// //         this.query.pipeline().push({ $match: textStage });
// //         return this;
// //       } catch (_) {}
// //     }

// //     // fallback fuzzy regex
// //     const regex = { $regex: term, $options: "i" };
// //     const conds = [];

// //     if (fields.length) {
// //       fields.forEach(f => conds.push({ [f]: regex }));
// //     } else {
// //       const schema = this.query.model?.schema?.obj;
// //       if (schema) {
// //         for (const k in schema) {
// //           if (schema[k] === String || schema[k].type === String) {
// //             conds.push({ [k]: regex });
// //           }
// //         }
// //       }
// //     }

// //     if (!conds.length) return this;

// //     if (this.isAggregate) {
// //       this.query.pipeline().push({ $match: { $or: conds } });
// //     } else {
// //       this.query = this.query.find({ $or: conds });
// //     }

// //     return this;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * SORTING
// //    * -------------------------------------------------------------
// //    */
// //   sort() {
// //     const s = this.queryString.sort;
// //     const sortStage = s ? s.split(",").join(" ") : "-createdAt -_id";

// //     if (this.isAggregate) {
// //       this.query.pipeline().push({ $sort: this._parseSort(sortStage) });
// //     } else {
// //       this.query = this.query.sort(sortStage);
// //     }
// //     return this;
// //   }

// //   _parseSort(sortStr) {
// //     const parsed = {};
// //     sortStr.split(" ").forEach(field => {
// //       field = field.trim();
// //       if (!field) return;
// //       parsed[field.replace("-", "")] = field.startsWith("-") ? -1 : 1;
// //     });
// //     return parsed;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * FIELD LIMITING
// //    * -------------------------------------------------------------
// //    */
// //   limitFields() {
// //     const f = this.queryString.fields;
// //     if (!f) return this;

// //     const fields = f.split(",").join(" ");
// //     if (this.isAggregate) {
// //       const proj = {};
// //       f.split(",").forEach(field => proj[field] = 1);
// //       this.query.pipeline().push({ $project: proj });
// //     } else {
// //       this.query = this.query.select(fields);
// //     }

// //     return this;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * CURSOR PAGINATION
// //    * ?lastId=...
// //    * ?lastDate=...
// //    * -------------------------------------------------------------
// //    */
// //   cursorPaginate() {
// //     const lastId = this.queryString.lastId;
// //     const lastDate = this.queryString.lastDate;

// //     if (!lastId && !lastDate) return this;

// //     const cond = [];

// //     if (lastDate) {
// //       cond.push({ date: { $lt: new Date(lastDate) } });
// //     }
// //     if (lastId) {
// //       cond.push({ _id: { $lt: new mongoose.Types.ObjectId(lastId) } });
// //     }

// //     if (this.isAggregate) {
// //       this.query.pipeline().push({ $match: { $or: cond } });
// //     } else {
// //       this.query = this.query.find({ $or: cond });
// //     }

// //     return this;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * PAGE/LIMIT PAGINATION
// //    * -------------------------------------------------------------
// //    */
// //   paginate() {
// //     const page = Number(this.queryString.page) || 1;
// //     const limit = Number(this.queryString.limit) || 50;
// //     const skip = (page - 1) * limit;

// //     this.pagination = { page, limit, skip };

// //     if (this.isAggregate) {
// //       this.query.pipeline().push({ $skip: skip }, { $limit: limit });
// //     } else {
// //       this.query = this.query.skip(skip).limit(limit);
// //     }

// //     return this;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * POPULATE
// //    * -------------------------------------------------------------
// //    */
// //   populate(map = {}) {
// //     if (!this.queryString.populate) return this;

// //     const fields = this.queryString.populate.split(",");
// //     fields.forEach(f => {
// //       if (!this.isAggregate) {
// //         this.query = this.query.populate({
// //           path: f,
// //           select: map[f] || "-__v"
// //         });
// //       }
// //     });
// //     return this;
// //   }

// //   /**
// //    * -------------------------------------------------------------
// //    * EXECUTE
// //    * -------------------------------------------------------------
// //    */
// //   async execute() {
// //     if (this.isAggregate) {
// //       const data = await this.query.exec();
// //       return { data, results: data.length };
// //     }

// //     const docs = await this.query;
// //     const count = await this.query.model.countDocuments(this.query.getFilter());

// //     const pages = Math.ceil(count / this.pagination.limit || 1);

// //     return {
// //       data: docs,
// //       results: docs.length,
// //       total: count,
// //       pagination: {
// //         ...this.pagination,
// //         total: count,
// //         pages,
// //         hasNext: this.pagination.page < pages,
// //         hasPrev: this.pagination.page > 1
// //       }
// //     };
// //   }
// // }

// // module.exports = ApiFeatures;