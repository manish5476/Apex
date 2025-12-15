/**
 * -------------------------------------------------------------
 * ApiFeatures Utility - Enhanced Version
 * -------------------------------------------------------------
 * A universal Mongoose query builder that supports:
 * ✅ Filtering (with advanced operators)
 * ✅ Sorting
 * ✅ Field limiting
 * ✅ Pagination (with metadata)
 * ✅ Multi-value queries (comma-separated)
 * ✅ Regex search
 * ✅ Soft-delete safe queries
 * ✅ Nested field access
 * ✅ Date range queries
 * ✅ Exclude fields
 * -------------------------------------------------------------
 */

class ApiFeatures {
  constructor(query, queryString) {
    this.query = query; // Mongoose query (e.g., Model.find())
    this.queryString = queryString; // Express req.query
    this.pagination = {}; // Metadata for pagination
    this.total = 0; // Total documents count
  }

  /**
   * -------------------------------------------------------------
   * ADVANCED FILTERING
   * Supports:
   * - price[gte]=100&price[lte]=500 (range queries)
   * - status=active,inactive (multi-value)
   * - name=john (regex search for strings)
   * - "address.city"="New York" (nested fields)
   * - date[gte]=2024-01-01&date[lte]=2024-12-31 (date ranges)
   * -------------------------------------------------------------
   */
  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
    excludedFields.forEach((el) => delete queryObj[el]);

    const mongoQuery = {};

    for (const key in queryObj) {
      if (!Object.hasOwn(queryObj, key)) continue;
      const value = queryObj[key];
      const schemaType = this.query.model.schema.path(key)?.instance;

      // 1️⃣ Handle multi-value fields (e.g., status=active,inactive)
      if (typeof value === 'string' && value.includes(',')) {
        mongoQuery[key] = { $in: value.split(',').map((v) => v.trim()) };
      }
      
      // 2️⃣ Handle object operators (gte, lte, gt, lt, ne, regex, options)
      else if (typeof value === 'object' && value !== null) {
        mongoQuery[key] = {};
        for (const op in value) {
          if (['gte', 'gt', 'lte', 'lt', 'ne', 'eq'].includes(op)) {
            mongoQuery[key]['$' + op] = value[op];
          } else if (op === 'regex') {
            mongoQuery[key]['$regex'] = value[op];
          } else if (op === 'options') {
            mongoQuery[key]['$options'] = value[op];
          }
        }
      }
      
      // 3️⃣ Handle boolean values (true/false strings)
      else if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) {
        mongoQuery[key] = value.toLowerCase() === 'true';
      }
      
      // 4️⃣ Handle string values with regex (for search)
      else if (typeof value === 'string' && schemaType === 'String') {
        mongoQuery[key] = { $regex: value, $options: 'i' };
      }
      
      // 5️⃣ Handle nested fields safely (e.g., "address.city"="Delhi")
      else if (key.includes('.')) {
        mongoQuery[key] = value;
      }
      
      // 6️⃣ Handle date strings (convert to Date objects)
      else if (typeof value === 'string' && schemaType === 'Date') {
        const date = new Date(value);
        if (!isNaN(date)) {
          mongoQuery[key] = date;
        } else {
          mongoQuery[key] = value;
        }
      }
      
      // 7️⃣ Fallback to exact match (ObjectIds, numbers, etc.)
      else {
        mongoQuery[key] = value;
      }
    }

    // Exclude soft-deleted records by default if schema supports it
    if (this.query.model.schema.path('isDeleted')) {
      mongoQuery.isDeleted = { $ne: true };
    }

    // Exclude inactive records by default if schema supports it
    if (this.query.model.schema.path('isActive')) {
      mongoQuery.isActive = { $ne: false };
    }

    this.query = this.query.find(mongoQuery);
    return this;
  }

  /**
   * -------------------------------------------------------------
   * FULL-TEXT SEARCH
   * Example: ?search=keyword
   * Searches in predefined fields or all string fields
   * -------------------------------------------------------------
   */
  search(searchFields = ['name', 'title', 'description']) {
    if (this.queryString.search) {
      const searchTerm = this.queryString.search;
      const searchConditions = [];

      searchFields.forEach(field => {
        searchConditions.push({
          [field]: { $regex: searchTerm, $options: 'i' }
        });
      });

      // If there are existing query conditions, use $and
      const currentQuery = this.query.getFilter();
      if (Object.keys(currentQuery).length > 0) {
        this.query = this.query.find({
          $and: [
            currentQuery,
            { $or: searchConditions }
          ]
        });
      } else {
        this.query = this.query.find({ $or: searchConditions });
      }
    }
    return this;
  }

  /**
   * -------------------------------------------------------------
   * SORTING
   * Example:
   * ?sort=price,-createdAt (ascending price, descending createdAt)
   * -------------------------------------------------------------
   */
  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      // Default sort by newest first
      this.query = this.query.sort('-createdAt _id');
    }
    return this;
  }

  /**
   * -------------------------------------------------------------
   * FIELD LIMITING
   * Example:
   * ?fields=name,price,category (include only these)
   * ?fields=-password,-__v (exclude these)
   * -------------------------------------------------------------
   */
  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      // Default exclude internal fields
      const defaultExcludes = '-__v -createdAt -updatedAt -isDeleted';
      this.query = this.query.select(defaultExcludes);
    }
    return this;
  }

  /**
   * -------------------------------------------------------------
   * PAGINATION WITH METADATA
   * Example: ?page=2&limit=10
   * Returns pagination metadata for frontend
   * -------------------------------------------------------------
   */
  paginate() {
    const page = parseInt(this.queryString.page, 10) || 1;
    const limit = parseInt(this.queryString.limit, 10) || 20;
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);
    
    this.pagination = {
      page,
      limit,
      skip,
      hasNext: false,
      hasPrev: page > 1
    };

    return this;
  }

  /**
   * -------------------------------------------------------------
   * GET PAGINATION METADATA
   * Call this after executing the query
   * -------------------------------------------------------------
   */
  async getPaginationMetadata() {
    const totalCount = await this.query.model.countDocuments(this.query.getFilter());
    const totalPages = Math.ceil(totalCount / this.pagination.limit);
    
    this.pagination.total = totalCount;
    this.pagination.pages = totalPages;
    this.pagination.hasNext = this.pagination.page < totalPages;
    
    return this.pagination;
  }

  /**
   * -------------------------------------------------------------
   * POPULATE RELATIONS
   * Example: ?populate=category,author
   * -------------------------------------------------------------
   */
  populate(populateOptions = {}) {
    if (this.queryString.populate) {
      const populateFields = this.queryString.populate.split(',');
      populateFields.forEach(field => {
        this.query = this.query.populate({
          path: field,
          select: populateOptions[field] || '-__v'
        });
      });
    }
    return this;
  }

  /**
   * -------------------------------------------------------------
   * EXECUTE QUERY WITH ALL FEATURES
   * Convenience method to apply all features at once
   * -------------------------------------------------------------
   */
  async execute() {
    const docs = await this.query;
    const pagination = await this.getPaginationMetadata();
    
    return {
      data: docs,
      pagination,
      total: pagination.total,
      results: docs.length
    };
  }
}

module.exports = ApiFeatures;
// /**
//  * -------------------------------------------------------------
//  * ApiFeatures Utility
//  * -------------------------------------------------------------
//  * A universal Mongoose query builder that supports:
//  * ✅ Filtering
//  * ✅ Sorting
//  * ✅ Field limiting
//  * ✅ Pagination
//  * ✅ Muti-value queries
//  * ✅ Regex search
//  * ✅ Soft-delete safe queries
//  * ✅ Nested field access
//  * -------------------------------------------------------------
//  */

// class ApiFeatures {
//   constructor(query, queryString) {
//     this.query = query;           // Mongoose query (e.g., Model.find())
//     this.queryString = queryString; // Express req.query
//     this.pagination = {};         // Metadata for frontend pagination
//   }

//   /**
//    * -------------------------------------------------------------
//    * FILTERING
//    * Example:
//    * ?price[gte]=100&price[lte]=500&status=active,inactive
//    * -------------------------------------------------------------
//    */
//   filter() {
//     const queryObj = { ...this.queryString };
//     const excludedFields = ['page', 'sort', 'limit', 'fields'];
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

//       // 2️⃣ Handle numeric operators (gte, lte, gt, lt)
//       else if (typeof value === 'object' && value !== null) {
//         mongoQuery[key] = {};
//         for (const op in value) {
//           if (['gte', 'gt', 'lte', 'lt'].includes(op)) {
//             mongoQuery[key]['$' + op] = value[op];
//           }
//         }
//       }

//       // 3️⃣ Handle string values with regex (for search)
//       else if (typeof value === 'string' && schemaType === 'String') {
//         mongoQuery[key] = { $regex: value, $options: 'i' };
//       }

//       // 4️⃣ Handle nested fields safely (e.g., address.city=Delhi)
//       else if (key.includes('.')) {
//         mongoQuery[key] = value;
//       }

//       // 5️⃣ Fallback to exact match (ObjectIds, numbers, etc.)
//       else {
//         mongoQuery[key] = value;
//       }
//     }

//     // Exclude soft-deleted records by default if schema supports it
//     if (this.query.model.schema.path('isDeleted')) {
//       mongoQuery.isDeleted = { $ne: true };
//     }

//     this.query = this.query.find(mongoQuery);
//     return this;
//   }

//   /**
//    * -------------------------------------------------------------
//    * SORTING
//    * Example:
//    * ?sort=price,-createdAt
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
//    * ?fields=name,price,category
//    * -------------------------------------------------------------
//    */
//   limitFields() {
//     if (this.queryString.fields) {
//       const fields = this.queryString.fields.split(',').join(' ');
//       this.query = this.query.select(fields);
//     } else {
//       // Default exclude internal fields
//       this.query = this.query.select('-__v -isDeleted');
//     }
//     return this;
//   }

//   /**
//    * -------------------------------------------------------------
//    * PAGINATION
//    * Example:
//    * ?page=2&limit=10
//    * -------------------------------------------------------------
//    */
//   paginate() {
//     const page = parseInt(this.queryString.page, 10) || 1;
//     const limit = parseInt(this.queryString.limit, 10) || 20;
//     const skip = (page - 1) * limit;

//     this.query = this.query.skip(skip).limit(limit);
//     this.pagination = { page, limit, skip };

//     return this;
//   }
// }

// module.exports = ApiFeatures;


// // class ApiFeatures {
// //     constructor(query, queryString) {
// //         this.query = query; // Mongoose query object (e.g., Product.find())
// //         this.queryString = queryString; // From Express (req.query)
// //     }

// //     /**
// //      * Filters the query based on the query string.
// //      * Handles operators like [gte], [gt], [lte], [lt], [regex], [options].
// //      * Example URL: /api/products?price[gte]=100&name[regex]=phone
// //      */
// // //   filter() {
// // //     const queryObj = { ...this.queryString };

// // //     // remove reserved params
// // //     const excludedFields = ['page', 'sort', 'limit', 'fields'];
// // //     excludedFields.forEach(el => delete queryObj[el]);

// // //     // build Mongo filter
// // //     const mongoFilter = {};

// // //     Object.keys(queryObj).forEach(key => {
// // //         const val = queryObj[key];

// // //         // Handle advanced query operators (gte, lte etc.)
// // //         if (typeof val === 'object') {
// // //             // Example: price[gte]=100
// // //             mongoFilter[key] = {};
// // //             Object.keys(val).forEach(op => {
// // //                 mongoFilter[key][`$${op}`] = val[op];
// // //             });
// // //         } else {
// // //             // For plain strings → convert to regex for partial match
// // //             if (isNaN(val)) {
// // //                 mongoFilter[key] = { $regex: val, $options: 'i' };
// // //             } else {
// // //                 mongoFilter[key] = val; // keep numbers as-is
// // //             }
// // //         }
// // //     });

// // //     this.query = this.query.find(mongoFilter);
// // //     return this;
// // // }
// // filter() {
// //     const queryObj = { ...this.queryString };
// //     const excludedFields = ['page', 'sort', 'limit', 'fields'];
// //     excludedFields.forEach(el => delete queryObj[el]);

// //     const mongoQuery = {};

// //     for (const key in queryObj) {
// //         if (!queryObj.hasOwnProperty(key)) continue;

// //         const value = queryObj[key];

// //         // If numeric operators exist
// //         if (typeof value === 'object' && value !== null) {
// //             mongoQuery[key] = {};
// //             for (const op in value) {
// //                 if (['gte','gt','lte','lt'].includes(op)) {
// //                     mongoQuery[key]['$' + op] = value[op];
// //                 }
// //             }
// //         } 
// //         // Only apply regex for string fields in schema
// //         else if (typeof value === 'string' && this.query.model.schema.path(key)?.instance === 'String') {
// //             mongoQuery[key] = { $regex: value, $options: 'i' };
// //         } 
// //         // Otherwise exact match (e.g., ObjectId)
// //         else {
// //             mongoQuery[key] = value;
// //         }
// //     }

// //     this.query = this.query.find(mongoQuery);
// //     return this;
// // }


// // // ------version 1
// //     // filter() {
// //     //     // 1. Create a shallow copy of the query string
// //     //     const queryObj = { ...this.queryString };

// //     //     // 2. Exclude special fields used for other features
// //     //     const excludedFields = ['page', 'sort', 'limit', 'fields'];
// //     //     excludedFields.forEach(el => delete queryObj[el]);

// //     //     // 3. Convert to a JSON string to replace operators with MongoDB format ($gte, $gt, etc.)
// //     //     let queryStr = JSON.stringify(queryObj);
// //     //     queryStr = queryStr.replace(/\b(gte|gt|lte|lt|regex|options)\b/g, match => `$${match}`);

// //     //     // 4. Apply the filter to the Mongoose query
// //     //     this.query = this.query.find(JSON.parse(queryStr));

// //     //     return this; // Return 'this' to allow chaining
// //     // }

   
// //     sort() {
// //         if (this.queryString.sort) {
// //             const sortBy = this.queryString.sort.split(',').join(' ');
// //             this.query = this.query.sort(sortBy);
// //         } else {
// //             // Default sort if none is provided
// //             this.query = this.query.sort('-createdAt');
// //         }
// //         return this;
// //     }

// //     /**
// //      * Limits the fields returned in the results.
// //      * Example URL: /api/products?fields=name,price,description
// //      */
// //     limitFields() {
// //         if (this.queryString.fields) {
// //             const fields = this.queryString.fields.split(',').join(' ');
// //             this.query = this.query.select(fields);
// //         } else {
// //             // By default, exclude the '__v' field from Mongoose
// //             this.query = this.query.select('-__v');
// //         }
// //         return this;
// //     }

// //     /**
// //      * Paginates the results.
// //      * Example URL: /api/products?page=2&limit=10
// //      */
// //     paginate() {
// //         const page = parseInt(this.queryString.page, 10) || 1;
// //         const limit = parseInt(this.queryString.limit, 10) || 100;
// //         const skip = (page - 1) * limit;

// //         this.query = this.query.skip(skip).limit(limit);
// //         return this;
// //     }
// // }

// // module.exports = ApiFeatures;

// // // class ApiFeatures {
// // //   constructor(query, queryString) {
// // //     if (!queryString || typeof queryString !== 'object') {
// // //       throw new Error('Query string must be a valid object');
// // //     }
// // //     this.query = query;
// // //     this.queryString = queryString;
// // //   }

// // //   filter() {
// // //     if (!this.query) {
// // //       this.query = {}; // Initialize as an empty object if not already defined
// // //     }

// // //     // Handle nested filter object
// // //     let filterObj = {};
// // //     if (this.queryString.filter) {
// // //       filterObj = { ...this.queryString.filter };
// // //     } else {
// // //       // If no filter object, use the entire queryString
// // //       filterObj = { ...this.queryString };
// // //     }

// // //     // Remove pagination, sorting, and field limiting parameters
// // //     const excludedFields = ['page', 'sort', 'limit', 'fields', 'filter'];
// // //     excludedFields.forEach((el) => delete filterObj[el]);

// // //     // Handle empty filter object
// // //     if (Object.keys(filterObj).length === 0) {
// // //       this.query = this.query.find({});
// // //       return this;
// // //     }

// // //     // Process each field in the filter
// // //     Object.keys(filterObj).forEach((key) => {
// // //       const value = filterObj[key];
      
// // //       // Handle regex search
// // //       if (value && typeof value === 'object' && value.regex) {
// // //         filterObj[key] = { $regex: value.regex, $options: 'i' };
// // //       }
// // //       // Handle numeric comparisons
// // //       else if (value && typeof value === 'object') {
// // //         const operators = ['gte', 'gt', 'lte', 'lt', 'ne', 'in', 'nin'];
// // //         operators.forEach(op => {
// // //           if (value[op] !== undefined) {
// // //             filterObj[key] = { ...filterObj[key], [`$${op}`]: value[op] };
// // //           }
// // //         });
// // //       }
// // //       // Handle array values
// // //       else if (Array.isArray(value)) {
// // //         filterObj[key] = { $in: value };
// // //       }
// // //       // Handle comma-separated string values
// // //       else if (typeof value === 'string' && value.includes(',')) {
// // //         filterObj[key] = { $in: value.split(',').map(item => item.trim()) };
// // //       }
// // //       // // Handle nested queries
// // //       // if (key.includes('.')) {
// // //       //   const nestedKeys = key.split('.');
// // //       //   let tempQuery = filterObj;
// // //       //   for (let i = 0; i < nestedKeys.length - 1; i++) {
// // //       //     tempQuery = tempQuery[nestedKeys[i]] = tempQuery[nestedKeys[i]] || {};
// // //       //   }
// // //       //   tempQuery[nestedKeys[nestedKeys.length - 1]] = filterObj[key];
// // //       //   delete filterObj[key];
// // //       // }
// // //       if (key.includes('.')) {
// // //         const nestedKeys = key.split('.');
// // //         let tempQuery = filterObj;
// // //         for (let i = 0; i < nestedKeys.length - 1; i++) {
// // //           tempQuery = tempQuery[nestedKeys[i]] = tempQuery[nestedKeys[i]] || {};
// // //         }
// // //         tempQuery[nestedKeys[nestedKeys.length - 1]] = value; // use original value
// // //         delete filterObj[key];
// // //       } else {
// // //         filterObj[key] = value; // set it only if not nested
// // //       }
      
// // //     });

// // //     this.query = this.query.find(filterObj);
// // //     return this;
// // //   }

// // //   sort() {
// // //     if (this.queryString.sort) {
// // //       const sortBy = this.queryString.sort.split(',').join(' ').trim();
// // //       this.query = this.query.sort(sortBy || '-createdAt');
// // //     } else {
// // //       this.query = this.query.sort('-createdAt');
// // //     }
// // //     return this;
// // //   }

// // //   limitFields() {
// // //     if (this.queryString.fields) {
// // //       const fields = this.queryString.fields.split(',').join(' ').trim();
// // //       this.query = this.query.select(fields || '-__v');
// // //     } else {
// // //       this.query = this.query.select('-__v');
// // //     }
// // //     return this;
// // //   }

// // //   paginate() {
// // //     const page = Math.max(parseInt(this.queryString.page, 10) || 1, 1);
// // //     const limit = Math.min(Math.max(parseInt(this.queryString.limit, 10) || 200, 1), 1000);
// // //     const skip = (page - 1) * limit;

// // //     if (skip < 0) {
// // //       throw new Error('Invalid page number');
// // //     }
// // //     this.query = this.query.skip(skip).limit(limit);
// // //     return this;
// // //   }
// // // }

// // // module.exports = ApiFeatures;
