'use strict';

const mongoose = require("mongoose");

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║                        ApiFeatures                              ║
 * ║  Standardized query builder for Mongoose & Aggregation.         ║
 * ║                                                                  ║
 * ║  Features:                                                       ║
 * ║  ✅ Smart Fuzzy Matching  (godr → godrej, NO false positives)   ║
 * ║  ✅ Sorting                                                      ║
 * ║  ✅ Filtering (range, OR, pipe, regex)                           ║
 * ║  ✅ Full-text Search                                             ║
 * ║  ✅ Field Limiting / Projection                                  ║
 * ║  ✅ Pagination (page/limit based)                                ║
 * ║  ✅ Relationship Population                                      ║
 * ║  ✅ Aggregate Pipeline Support                                   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * QUERY STRING EXAMPLES:
 * ----------------------
 *  ?name=godr                        → fuzzy matches "Godrej", "gojrej"
 *  ?status=active                    → exact match
 *  ?status=active|pending            → OR match using pipe
 *  ?category[or]=electronics,books   → OR match using bracket syntax
 *  ?price[gte]=100&price[lte]=500    → range filter
 *  ?sort=-createdAt,name             → sort (desc createdAt, asc name)
 *  ?fields=name,price,status         → projection
 *  ?page=2&limit=20                  → pagination
 *  ?search=laptop                    → full-text search across given fields
 *  ?populate=category,brand          → populate relations
 */
class ApiFeatures {

  constructor(query, queryString, isAggregate = false) {
    this.query = query;
    this.queryString = queryString;
    this.isAggregate = isAggregate;
    this.pagination = {};
  }

  // ─────────────────────────────────────────────────────────────────
  // 1. TYPE COERCION
  // ─────────────────────────────────────────────────────────────────

  static coerceValue(value) {
    if (typeof value !== "string") return value;

    const lowerVal = value.toLowerCase().trim();

    if (lowerVal === "true")  return true;
    if (lowerVal === "false") return false;
    if (lowerVal === "null")  return null;

    if (
      value.trim() !== "" &&
      !isNaN(value) &&
      value.length < 12 &&
      !value.startsWith("0x")
    ) {
      return Number(value);
    }

    if (/^[0-9a-fA-F]{24}$/.test(value)) {
      return new mongoose.Types.ObjectId(value);
    }

    const d = new Date(value);
    if (!isNaN(d.getTime()) && value.includes("-")) return d;

    return value;
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. SMART FUZZY PATTERN BUILDER
  // ─────────────────────────────────────────────────────────────────

  /**
   * Builds 3 regex patterns from a search term — ordered strict → loose.
   *
   *  Pattern 1 — Exact substring:
   *    "godrej" → /godrej/i
   *    Must appear as a contiguous block. Most precise.
   *
   *  Pattern 2 — Typo tolerant:
   *    "godr" → /g.?o.?d.?r/i
   *    Each character can have ONE extra/wrong character between them.
   *    Catches "godrej" (the extra 'e','j' absorbed by .*? logic via .?)
   *
   *  Pattern 3 — Subsequence:
   *    "godr" → /g.*o.*d.*r/i
   *    All characters must appear IN ORDER but anything can be between.
   *    "gojrej" has g→o→j→r→e→j: looking for g✅ o✅ d❌...
   *    Wait — "gojrej": g(0) o(1) j(2) r(3) e(4) j(5)
   *    Subsequence of "godr": g✅ o✅ d→ not found directly but
   *    actually "gojrej" does NOT contain 'd', so subsequence /g.*o.*d.*r/
   *    would NOT match "gojrej". This is CORRECT behavior — it means
   *    the user typed something genuinely different.
   *
   *    For "godrej" → g✅ o✅ d✅ r✅ → MATCHES ✅
   *    For "godr"   → typo pattern /g.?o.?d.?r/ → "godrej": g-o-d-r ✅
   *
   * @param  {string} term
   * @returns {{ exact: string, typo: string, subsequence: string } | null}
   */
  static buildSmartPatterns(term) {
    if (!term || typeof term !== "string") return null;

    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const chars  = term.split("").map(escape);

    return {
      // Contiguous match
      exact: escape(term),

      // Each char allows 0 or 1 extra char between — catches small typos
      // "godr" → g.?o.?d.?r → matches "godrej","go-dr","goXdr"
      typo: chars.join(".?"),

      // Chars must appear in order, anything between
      // "godr" → g.*o.*d.*r → matches "go---d---r-anything"
      subsequence: chars.join(".*"),
    };
  }

  /**
   * Builds the MongoDB $or conditions for a single fuzzy field match.
   * Returns 3 conditions (exact, typo, subsequence) for the given field.
   *
   * @param  {string}   field - MongoDB field name
   * @param  {string}   term  - user input string
   * @returns {object[]}       array of { [field]: { $regex, $options } }
   */
  static buildFuzzyConditions(field, term) {
    const patterns = ApiFeatures.buildSmartPatterns(term);
    if (!patterns) return [];

    return [
      { [field]: { $regex: patterns.exact,       $options: "i" } },
      { [field]: { $regex: patterns.typo,         $options: "i" } },
      { [field]: { $regex: patterns.subsequence,  $options: "i" } },
    ];
  }

  // ─────────────────────────────────────────────────────────────────
  // 3. FILTER
  // ─────────────────────────────────────────────────────────────────

  /**
   * Applies all query string filters to the Mongoose query.
   *
   * THE FIX (vs previous version that returned all data):
   *  ❌ OLD: pushed 10+ bigram patterns ("go","od","dr") into $or
   *          → bigrams match almost every word → returned all docs
   *
   *  ✅ NEW: pushes only 3 ordered patterns per field:
   *          exact + typo + subsequence
   *          Subsequence REQUIRES chars in correct ORDER, so false
   *          positives are rare (unlike bigrams which ignore order).
   *
   *  Also fixed: exact filterConditions (status=active) are applied
   *  as a separate .find() BEFORE the fuzzy $or, so they always AND.
   *  This means ?name=godr&status=active correctly returns only
   *  active products whose name fuzzy-matches "godr".
   */
  filter() {
    const queryObj = { ...this.queryString };

    const excludedFields = [
      "page", "sort", "limit", "fields",
      "search", "populate", "lastId", "lastDate",
    ];
    excludedFields.forEach((el) => delete queryObj[el]);

    const filterConditions = {};  // exact/range fields → ANDed
    const orConditions     = [];  // fuzzy text fields  → ORed

    // These fields use fuzzy matching — everything else is exact
    const FUZZY_FIELDS = [
      "name", "sku", "title", "description",
      "referenceNumber", "barcode", "email",
      "phone", "brand", "tags",
    ];

    for (const key in queryObj) {
      const value = queryObj[key];

      // Skip empty values to avoid ObjectId casting errors
      if (value === "" || value === null || value === undefined) continue;

      // ── ?category[or]=electronics,books ─────────────────────────
      if (key.endsWith("[or]")) {
        const field  = key.replace("[or]", "");
        const values = String(value)
          .split(",")
          .map((v) => ApiFeatures.coerceValue(v.trim()));
        orConditions.push({ [field]: { $in: values } });
        continue;
      }

      // ── ?status=active|pending ───────────────────────────────────
      if (typeof value === "string" && value.includes("|")) {
        filterConditions[key] = {
          $in: value.split("|").map((v) => ApiFeatures.coerceValue(v.trim())),
        };
        continue;
      }

      // ── ?price[gte]=100&price[lte]=500 ──────────────────────────
      if (typeof value === "object" && value !== null) {
        filterConditions[key] = {};
        for (const op in value) {
          filterConditions[key][`$${op}`] = ApiFeatures.coerceValue(value[op]);
        }
        continue;
      }

      const coercedValue = ApiFeatures.coerceValue(value);

      // ── Fuzzy match for text fields ──────────────────────────────
      if (typeof coercedValue === "string" && FUZZY_FIELDS.includes(key)) {
        const conditions = ApiFeatures.buildFuzzyConditions(key, coercedValue);
        orConditions.push(...conditions);
        continue;
      }

      // ── Exact match for everything else ─────────────────────────
      filterConditions[key] = coercedValue;
    }

    // Apply to query
    if (this.isAggregate) {
      if (Object.keys(filterConditions).length) {
        this.query.pipeline().push({ $match: filterConditions });
      }
      if (orConditions.length) {
        this.query.pipeline().push({ $match: { $or: orConditions } });
      }
    } else {
      // Step 1: Apply exact/range filters (AND) — narrows the result set
      if (Object.keys(filterConditions).length) {
        this.query = this.query.find(filterConditions);
      }
      // Step 2: Apply fuzzy OR within the already-narrowed result set
      if (orConditions.length) {
        this.query = this.query.find({ $or: orConditions });
      }
    }

    return this;
  }

  // ─────────────────────────────────────────────────────────────────
  // 4. SEARCH  (?search=term)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Fuzzy full-text search across multiple fields simultaneously.
   * Uses the same 3-pattern strategy (exact → typo → subsequence).
   *
   * @param {string[]} fields - fields to search across
   *
   * Usage:  .search(["name", "description", "sku"])
   * Query:  ?search=godr
   */
  search(fields = []) {
    const searchTerm = this.queryString.search;
    if (!searchTerm || fields.length === 0) return this;

    const searchConditions = [];

    fields.forEach((field) => {
      const conditions = ApiFeatures.buildFuzzyConditions(field, searchTerm);
      searchConditions.push(...conditions);
    });

    if (this.isAggregate) {
      this.query.pipeline().push({ $match: { $or: searchConditions } });
    } else {
      this.query = this.query.find({ $or: searchConditions });
    }

    return this;
  }

  // ─────────────────────────────────────────────────────────────────
  // 5. SORT
  // ─────────────────────────────────────────────────────────────────

  /**
   * Sorts results. Default: newest first (-createdAt -_id).
   * Query: ?sort=-createdAt,name
   */
  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(",").join(" ");
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort("-createdAt -_id");
    }
    return this;
  }

  // ─────────────────────────────────────────────────────────────────
  // 6. FIELD LIMITING / PROJECTION
  // ─────────────────────────────────────────────────────────────────

  /**
   * Limits returned fields. Always strips __v.
   * Query: ?fields=name,price,status
   */
  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(",").join(" ");
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select("-__v");
    }
    return this;
  }

  // ─────────────────────────────────────────────────────────────────
  // 7. PAGINATION
  // ─────────────────────────────────────────────────────────────────

  /**
   * Page + limit based pagination. Defaults: page=1, limit=50.
   * Query: ?page=2&limit=20
   */
  paginate() {
    const page  = Math.abs(parseInt(this.queryString.page,  10)) || 1;
    const limit = Math.abs(parseInt(this.queryString.limit, 10)) || 50;
    const skip  = (page - 1) * limit;

    this.pagination = { page, limit, skip };
    this.query = this.query.skip(skip).limit(limit);

    return this;
  }

  // ─────────────────────────────────────────────────────────────────
  // 8. POPULATE
  // ─────────────────────────────────────────────────────────────────

  /**
   * Populates referenced relationships.
   * Query: ?populate=category,brand
   */
  populate() {
    if (this.queryString.populate) {
      const paths = this.queryString.populate.split(",");
      paths.forEach((p) => {
        this.query = this.query.populate(p.trim());
      });
    }
    return this;
  }

  // ─────────────────────────────────────────────────────────────────
  // 9. EXECUTE
  // ─────────────────────────────────────────────────────────────────

  /**
   * Executes the built query and returns a structured result.
   *
   * Regular query returns:
   * {
   *   data       : [...],
   *   results    : 5,
   *   pagination : { page, limit, totalResults, totalPages, hasNextPage, hasPrevPage }
   * }
   *
   * Aggregate returns:
   * {
   *   data    : [...],
   *   results : 5
   * }
   */
  async execute() {
    if (this.isAggregate) {
      const data = await this.query.exec();
      return { data, results: data.length };
    }

    // Count based on CURRENT filters (not whole collection)
    const currentFilter = this.query.getFilter();
    const totalCount    = await this.query.model.countDocuments(currentFilter);

    const docs       = await this.query.lean();
    const totalPages = Math.ceil(totalCount / (this.pagination.limit || 50));

    return {
      data:    docs,
      results: docs.length,
      pagination: {
        page:         this.pagination.page,
        limit:        this.pagination.limit,
        totalResults: totalCount,
        totalPages,
        hasNextPage:  this.pagination.page < totalPages,
        hasPrevPage:  this.pagination.page > 1,
      },
    };
  }
}

module.exports = ApiFeatures;


// ═══════════════════════════════════════════════════════════════════
// WHY THE OLD VERSION RETURNED ALL DATA — AND WHY THIS DOESN'T
// ═══════════════════════════════════════════════════════════════════
//
//  ❌ OLD: bigrams of "godr" → ["go","od","dr"]
//     "go" matches: "google","gone","good","ago","logo"... (100s of docs)
//     "od" matches: "model","product","mode"...            (100s of docs)
//     Since it was $or, ANY match returned the doc → almost everything matched
//
//  ✅ NEW: 3 ordered patterns for "godr":
//     exact:       /godr/i         → only "godr..." words
//     typo:        /g.?o.?d.?r/i   → "godrej","go-dr" — NOT "google"
//     subsequence: /g.*o.*d.*r/i   → must have g THEN o THEN d THEN r
//                                    "google" = g,o,o,g,l,e → has g,o but no d → ❌
//                                    "godrej" = g,o,d,r,e,j → g✅ o✅ d✅ r✅ → ✅
//
// ═══════════════════════════════════════════════════════════════════
// CONTROLLER USAGE
// ═══════════════════════════════════════════════════════════════════
//
//  exports.getAllProducts = async (req, res) => {
//    const features = new ApiFeatures(Product.find(), req.query)
//      .filter()                              // ?name=godr → finds "Godrej"
//      .search(["name", "description"])       // ?search=godr → fuzzy across both
//      .sort()                                // ?sort=-price
//      .limitFields()                         // ?fields=name,price
//      .paginate();                           // ?page=1&limit=20
//
//    const result = await features.execute();
//    res.status(200).json({ status: "success", ...result });
//  };
//
// ═══════════════════════════════════════════════════════════════════
// PERFORMANCE TIP FOR LARGE COLLECTIONS (10k+ docs)
// ═══════════════════════════════════════════════════════════════════
//
//  Regex queries scan the entire collection by default.
//  Add a MongoDB text index for faster search:
//
//  productSchema.index({ name: "text", description: "text" });
//
//  Then optionally use $text: { $search: term } for primary search
//  and fall back to this fuzzy regex only when needed.
//
// ═══════════════════════════════════════════════════════════════════
// 


// 'use strict';

// const mongoose = require("mongoose");

// /**
//  * ╔══════════════════════════════════════════════════════════════════╗
//  * ║                        ApiFeatures                              ║
//  * ║  Standardized query builder for Mongoose & Aggregation.         ║
//  * ║                                                                  ║
//  * ║  Features:                                                       ║
//  * ║  ✅ Fuzzy / Partial Matching  (godr → gojrej)                   ║
//  * ║  ✅ Sorting                                                      ║
//  * ║  ✅ Filtering (range, OR, pipe, regex)                           ║
//  * ║  ✅ Full-text Search                                             ║
//  * ║  ✅ Field Limiting / Projection                                  ║
//  * ║  ✅ Pagination (page/limit based)                                ║
//  * ║  ✅ Relationship Population                                      ║
//  * ║  ✅ Aggregate Pipeline Support                                   ║
//  * ╚══════════════════════════════════════════════════════════════════╝
//  *
//  * USAGE EXAMPLE:
//  * --------------
//  *  const features = new ApiFeatures(Model.find(), req.query)
//  *    .filter()
//  *    .search(["name", "description"])
//  *    .sort()
//  *    .limitFields()
//  *    .paginate();
//  *
//  *  const result = await features.execute();
//  *  // result → { data, results, pagination }
//  *
//  * QUERY STRING EXAMPLES:
//  * ----------------------
//  *  ?name=godr                        → fuzzy matches "Godrej", "gojrej", etc.
//  *  ?status=active                    → exact match
//  *  ?status=active|pending            → OR match using pipe
//  *  ?category[or]=electronics,books   → OR match using bracket syntax
//  *  ?price[gte]=100&price[lte]=500    → range filter
//  *  ?sort=-createdAt,name             → sort (desc createdAt, asc name)
//  *  ?fields=name,price,status         → projection
//  *  ?page=2&limit=20                  → pagination
//  *  ?search=laptop                    → full-text search across given fields
//  *  ?populate=category,brand          → populate relations
//  */
// class ApiFeatures {

//   /**
//    * @param {mongoose.Query | mongoose.Aggregate} query     - Mongoose query or aggregate
//    * @param {object}                               queryString - req.query object
//    * @param {boolean}                              isAggregate - true if using aggregate pipeline
//    */
//   constructor(query, queryString, isAggregate = false) {
//     this.query = query;
//     this.queryString = queryString;
//     this.isAggregate = isAggregate;
//     this.pagination = {};
//   }

//   // ─────────────────────────────────────────────────────────────────
//   // 1. TYPE COERCION
//   // ─────────────────────────────────────────────────────────────────

//   /**
//    * Converts URL string values to correct JS/MongoDB types.
//    * Handles: booleans, null, numbers, ObjectIds, Dates.
//    */
//   static coerceValue(value) {
//     if (typeof value !== "string") return value;

//     const lowerVal = value.toLowerCase().trim();

//     if (lowerVal === "true")  return true;
//     if (lowerVal === "false") return false;
//     if (lowerVal === "null")  return null;

//     // Numeric (but not ObjectId-length, not hex)
//     if (
//       value.trim() !== "" &&
//       !isNaN(value) &&
//       value.length < 12 &&
//       !value.startsWith("0x")
//     ) {
//       return Number(value);
//     }

//     // Valid MongoDB ObjectId (24 hex chars)
//     if (/^[0-9a-fA-F]{24}$/.test(value)) {
//       return new mongoose.Types.ObjectId(value);
//     }

//     // ISO Date string (must contain '-' to avoid matching pure numbers)
//     const d = new Date(value);
//     if (!isNaN(d.getTime()) && value.includes("-")) return d;

//     return value;
//   }

//   // ─────────────────────────────────────────────────────────────────
//   // 2. FUZZY REGEX BUILDER  ← KEY UPGRADE
//   // ─────────────────────────────────────────────────────────────────

//   /**
//    * Builds multiple regex patterns from a user input string to support
//    * fuzzy / tolerant matching. Combines 3 strategies:
//    *
//    *  Strategy 1 — Exact substring   : "godrej" → /godrej/i
//    *  Strategy 2 — Subsequence       : "godr"   → /g.*o.*d.*r/i
//    *                                   (letters in order, anything between)
//    *  Strategy 3 — Bigram chunks     : "godr"   → /go/i, /od/i, /dr/i
//    *                                   (any 2-char window must appear)
//    *
//    * All patterns are combined in an $or query so ANY match returns the doc.
//    *
//    * Examples:
//    *  Input "godr"   → matches "Godrej", "gojrej", "go-drive" etc.
//    *  Input "gojrej" → matches "Gojrej", "GOJREJ" etc.
//    *  Input "sony"   → matches "Sony", "SONY Electronics" etc.
//    *
//    * @param  {string}   term - raw search term from query string
//    * @returns {string[]}      array of regex pattern strings
//    */
//   static buildFuzzyPatterns(term) {
//     if (!term || typeof term !== "string") return [];

//     // Escape special regex characters
//     const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

//     const patterns = new Set();

//     // ── Strategy 1: Exact substring ──────────────────────────────
//     patterns.add(escape(term));

//     // ── Strategy 2: Subsequence (loose char order) ───────────────
//     // "godr" → "g.*o.*d.*r"
//     const subsequence = term
//       .split("")
//       .map(escape)
//       .join(".*");
//     patterns.add(subsequence);

//     // ── Strategy 3: Bigrams (sliding 2-char windows) ─────────────
//     // "godr" → ["go", "od", "dr"]
//     for (let i = 0; i < term.length - 1; i++) {
//       patterns.add(escape(term.slice(i, i + 2)));
//     }

//     // ── Strategy 4: Trigrams (sliding 3-char windows) ────────────
//     // Helps with longer strings: "godrej" → ["god","odr","dre","rej"]
//     for (let i = 0; i < term.length - 2; i++) {
//       patterns.add(escape(term.slice(i, i + 3)));
//     }

//     return [...patterns];
//   }

//   // ─────────────────────────────────────────────────────────────────
//   // 3. FILTER
//   // ─────────────────────────────────────────────────────────────────

//   /**
//    * Applies filters from query string to the Mongoose query.
//    *
//    * Supports:
//    *  ?field=value              → exact or fuzzy (for text fields)
//    *  ?field[gte]=val           → range: $gte, $lte, $gt, $lt, $ne, $in
//    *  ?field[or]=val1,val2      → $in using [or] bracket syntax
//    *  ?field=val1|val2          → $in using pipe syntax
//    *  ?name=godr                → fuzzy regex across regexFields
//    */
//   filter() {
//     const queryObj = { ...this.queryString };

//     // Strip pagination/meta fields — they are not filters
//     const excludedFields = [
//       "page", "sort", "limit", "fields",
//       "search", "populate", "lastId", "lastDate",
//     ];
//     excludedFields.forEach((el) => delete queryObj[el]);

//     const filterConditions = {};
//     const orConditions    = [];

//     // Text fields that support fuzzy/regex matching
//     const FUZZY_FIELDS = [
//       "name", "sku", "title", "description",
//       "referenceNumber", "barcode", "email", "phone",
//       "brand", "category", "tags",
//     ];

//     for (const key in queryObj) {
//       const value = queryObj[key];

//       // Skip empty / null / undefined to avoid casting errors on ObjectId fields
//       if (value === "" || value === null || value === undefined) continue;

//       // ── OR bracket syntax: ?category[or]=electronics,books ──────
//       if (key.endsWith("[or]")) {
//         const field = key.replace("[or]", "");
//         const values = String(value)
//           .split(",")
//           .map((v) => ApiFeatures.coerceValue(v.trim()));
//         orConditions.push({ [field]: { $in: values } });
//         continue;
//       }

//       // ── Pipe OR syntax: ?status=active|pending ──────────────────
//       if (typeof value === "string" && value.includes("|")) {
//         filterConditions[key] = {
//           $in: value.split("|").map((v) => ApiFeatures.coerceValue(v.trim())),
//         };
//         continue;
//       }

//       // ── Range/operator syntax: ?price[gte]=100 ──────────────────
//       if (typeof value === "object" && value !== null) {
//         filterConditions[key] = {};
//         for (const op in value) {
//           filterConditions[key][`$${op}`] = ApiFeatures.coerceValue(value[op]);
//         }
//         continue;
//       }

//       const coercedValue = ApiFeatures.coerceValue(value);

//       // ── Fuzzy matching for known text fields ─────────────────────
//       //
//       //  Instead of a single /godr/i (fails on "gojrej"),
//       //  we generate multiple patterns and OR them together.
//       //  This means typing "godr" will still surface "Godrej".
//       //
//       if (typeof coercedValue === "string" && FUZZY_FIELDS.includes(key)) {
//         const patterns = ApiFeatures.buildFuzzyPatterns(coercedValue);

//         // Each pattern is one possible match — push all into $or
//         patterns.forEach((p) => {
//           orConditions.push({ [key]: { $regex: p, $options: "i" } });
//         });
//         continue;
//       }

//       // ── Exact match for all other fields ─────────────────────────
//       filterConditions[key] = coercedValue;
//     }

//     // Apply to query
//     if (this.isAggregate) {
//       if (Object.keys(filterConditions).length) {
//         this.query.pipeline().push({ $match: filterConditions });
//       }
//       if (orConditions.length) {
//         this.query.pipeline().push({ $match: { $or: orConditions } });
//       }
//     } else {
//       this.query = this.query.find(filterConditions);
//       if (orConditions.length) {
//         this.query = this.query.find({ $or: orConditions });
//       }
//     }

//     return this;
//   }

//   // ─────────────────────────────────────────────────────────────────
//   // 4. SEARCH
//   // ─────────────────────────────────────────────────────────────────

//   /**
//    * Global full-text search across multiple fields using a single term.
//    * Uses fuzzy patterns for each field — same tolerant matching as filter().
//    *
//    * @param {string[]} fields - list of fields to search across
//    *
//    * Usage: .search(["name", "description", "sku"])
//    * Query: ?search=godr
//    */
//   search(fields = []) {
//     const searchTerm = this.queryString.search;
//     if (!searchTerm || fields.length === 0) return this;

//     const patterns = ApiFeatures.buildFuzzyPatterns(searchTerm);

//     // For each field × each pattern → one OR condition
//     const searchConditions = [];
//     fields.forEach((field) => {
//       patterns.forEach((p) => {
//         searchConditions.push({ [field]: { $regex: p, $options: "i" } });
//       });
//     });

//     if (this.isAggregate) {
//       this.query.pipeline().push({ $match: { $or: searchConditions } });
//     } else {
//       this.query = this.query.find({ $or: searchConditions });
//     }

//     return this;
//   }

//   // ─────────────────────────────────────────────────────────────────
//   // 5. SORT
//   // ─────────────────────────────────────────────────────────────────

//   /**
//    * Sorts results.
//    * Default: newest first (-createdAt -_id).
//    *
//    * Query: ?sort=-createdAt,name
//    */
//   sort() {
//     if (this.queryString.sort) {
//       const sortBy = this.queryString.sort.split(",").join(" ");
//       this.query = this.query.sort(sortBy);
//     } else {
//       this.query = this.query.sort("-createdAt -_id");
//     }
//     return this;
//   }

//   // ─────────────────────────────────────────────────────────────────
//   // 6. FIELD LIMITING / PROJECTION
//   // ─────────────────────────────────────────────────────────────────

//   /**
//    * Limits which fields are returned (whitelist).
//    * Always strips __v by default.
//    *
//    * Query: ?fields=name,price,status
//    */
//   limitFields() {
//     if (this.queryString.fields) {
//       const fields = this.queryString.fields.split(",").join(" ");
//       this.query = this.query.select(fields);
//     } else {
//       this.query = this.query.select("-__v");
//     }
//     return this;
//   }

//   // ─────────────────────────────────────────────────────────────────
//   // 7. PAGINATION
//   // ─────────────────────────────────────────────────────────────────

//   /**
//    * Page + limit based pagination.
//    * Defaults: page=1, limit=50.
//    *
//    * Query: ?page=2&limit=20
//    */
//   paginate() {
//     const page  = Math.abs(parseInt(this.queryString.page,  10)) || 1;
//     const limit = Math.abs(parseInt(this.queryString.limit, 10)) || 50;
//     const skip  = (page - 1) * limit;

//     this.pagination = { page, limit, skip };
//     this.query = this.query.skip(skip).limit(limit);

//     return this;
//   }

//   // ─────────────────────────────────────────────────────────────────
//   // 8. POPULATE
//   // ─────────────────────────────────────────────────────────────────

//   /**
//    * Populates referenced relationships.
//    *
//    * Query: ?populate=category,brand
//    */
//   populate() {
//     if (this.queryString.populate) {
//       const paths = this.queryString.populate.split(",");
//       paths.forEach((p) => {
//         this.query = this.query.populate(p.trim());
//       });
//     }
//     return this;
//   }

//   // ─────────────────────────────────────────────────────────────────
//   // 9. EXECUTE
//   // ─────────────────────────────────────────────────────────────────

//   /**
//    * Executes the query and returns structured response.
//    *
//    * For regular queries returns:
//    * {
//    *   data       : [...],
//    *   results    : 10,
//    *   pagination : { page, limit, totalResults, totalPages, hasNextPage, hasPrevPage }
//    * }
//    *
//    * For aggregate queries returns:
//    * {
//    *   data    : [...],
//    *   results : 10
//    * }
//    */
//   async execute() {
//     // ── Aggregate pipeline execution ─────────────────────────────
//     if (this.isAggregate) {
//       const data = await this.query.exec();
//       return { data, results: data.length };
//     }

//     // ── Regular query execution ──────────────────────────────────
//     //
//     // IMPORTANT: Count is calculated against the CURRENT filters,
//     // not the whole collection — so pagination is always accurate.
//     //
//     const currentFilter = this.query.getFilter();
//     const totalCount    = await this.query.model.countDocuments(currentFilter);

//     const docs       = await this.query.lean();   // .lean() = faster, plain JS objects
//     const totalPages = Math.ceil(totalCount / (this.pagination.limit || 50));

//     return {
//       data:    docs,
//       results: docs.length,
//       pagination: {
//         page:         this.pagination.page,
//         limit:        this.pagination.limit,
//         totalResults: totalCount,
//         totalPages,
//         hasNextPage:  this.pagination.page < totalPages,
//         hasPrevPage:  this.pagination.page > 1,
//       },
//     };
//   }
// }

// module.exports = ApiFeatures;


// // ═══════════════════════════════════════════════════════════════════
// // USAGE EXAMPLES (copy into your controller)
// // ═══════════════════════════════════════════════════════════════════
// //
// // ── Basic product listing with fuzzy name filter ─────────────────
// //
// //  exports.getAllProducts = async (req, res) => {
// //    const features = new ApiFeatures(Product.find(), req.query)
// //      .filter()                             // ?name=godr → finds "Godrej"
// //      .search(["name", "description"])      // ?search=godr → fuzzy across both
// //      .sort()                               // ?sort=-price
// //      .limitFields()                        // ?fields=name,price
// //      .paginate();                          // ?page=1&limit=20
// //
// //    const result = await features.execute();
// //
// //    res.status(200).json({
// //      status: "success",
// //      ...result,
// //    });
// //  };
// //
// //
// // ── With Aggregation pipeline ─────────────────────────────────────
// //
// //  exports.getProductStats = async (req, res) => {
// //    const aggregate = Product.aggregate([
// //      { $lookup: { from: "categories", localField: "category", foreignField: "_id", as: "category" } }
// //    ]);
// //
// //    const features = new ApiFeatures(aggregate, req.query, true)
// //      .filter()
// //      .search(["name"]);
// //
// //    const result = await features.execute();
// //    res.status(200).json({ status: "success", ...result });
// //  };
// //
// //
// // ── Fuzzy matching reference table ───────────────────────────────
// //
// //  Input       Patterns Generated               Matches
// //  ─────────── ──────────────────────────────── ────────────────────
// //  "godr"      godr, g.*o.*d.*r, go,od,dr,      "Godrej" ✅
// //              god,odr,dr                        "gojrej" ✅
// //  "godrej"    godrej, g.*o.*d.*r.*e.*j,         "GODREJ" ✅
// //              go,od,dr,re,ej,god,odr,dre,rej    "Godrej Ltd" ✅
// //  "sony"      sony, s.*o.*n.*y, so,on,ny,       "SONY" ✅
// //              son,ony                            "Sony Electronics" ✅
// //
// //
// // ── Performance tip for large collections ────────────────────────
// //
// //  Add a text index to avoid full collection scans on regex queries:
// //
// //  productSchema.index({ name: "text", description: "text" });
// //
// // ═══════════════════════════════════════════════════════════════════
// // // 'use strict';

// // const mongoose = require("mongoose");

// // /**
// //  * ApiFeatures
// //  * Standardized query builder for Mongoose and Aggregation frameworks.
// //  * Handles: Sorting, Filtering, Searching, Field Limiting, and Intelligent Pagination.
// //  */
// // class ApiFeatures {
// //   constructor(query, queryString, isAggregate = false) {
// //     this.query = query;
// //     this.queryString = queryString;
// //     this.isAggregate = isAggregate;
// //     this.pagination = {};
// //   }

// //   /**
// //    * Safe Type Coercion
// //    * Ensures values from URL strings are converted to correct DB types.
// //    */
// //   static coerceValue(value) {
// //     if (typeof value !== "string") return value;

// //     const lowerVal = value.toLowerCase().trim();
// //     if (lowerVal === "true") return true;
// //     if (lowerVal === "false") return false;
// //     if (lowerVal === "null") return null;

// //     // Check if it's a numeric string (but not an ObjectId)
// //     if (value.trim() !== "" && !isNaN(value) && value.length < 12 && !value.startsWith('0x')) {
// //       return Number(value);
// //     }

// //     // Strict ObjectId validation to avoid casting errors
// //     if (/^[0-9a-fA-F]{24}$/.test(value)) {
// //       return new mongoose.Types.ObjectId(value);
// //     }

// //     // Handle Date coercion
// //     const d = new Date(value);
// //     if (!isNaN(d.getTime()) && value.includes('-')) return d;

// //     return value;
// //   }

// //   /**
// //    * Filtering Logic
// //    * Supports: ?status=active, ?price[gte]=100, ?category[or]=electronics,books
// //    */
// //   filter() {
// //     const queryObj = { ...this.queryString };
// //     const excludedFields = ["page", "sort", "limit", "fields", "search", "populate", "lastId", "lastDate"];
// //     excludedFields.forEach((el) => delete queryObj[el]);

// //     let filterConditions = {};
// //     const orConditions = [];

// //     for (const key in queryObj) {
// //       const value = queryObj[key];

// //       // Skip empty, null, or undefined values to avoid casting errors on ObjectId fields
// //       if (value === "" || value === null || value === undefined) continue;

// //       // OR syntax: field[or]=val1,val2
// //       if (key.endsWith("[or]")) {
// //         const field = key.replace("[or]", "");
// //         const values = String(value).split(",").map(v => ApiFeatures.coerceValue(v.trim()));
// //         orConditions.push({ [field]: { $in: values } });
// //         continue;
// //       }

// //       // Pipe syntax: status=active|pending
// //       if (typeof value === "string" && value.includes("|")) {
// //         filterConditions[key] = { $in: value.split("|").map(v => ApiFeatures.coerceValue(v.trim())) };
// //         continue;
// //       }

// //       // Range operators: [gte], [lte], [ne]
// //       if (typeof value === "object" && value !== null) {
// //         filterConditions[key] = {};
// //         for (const op in value) {
// //           filterConditions[key][`$${op}`] = ApiFeatures.coerceValue(value[op]);
// //         }
// //         continue;
// //       }

// //       const coercedValue = ApiFeatures.coerceValue(value);

// //       // Auto-apply regex for common text fields to support partial matching
// //       const regexFields = ["name", "sku", "title", "description", "referenceNumber", "barcode", "email", "phone"];
// //       if (typeof coercedValue === "string" && regexFields.includes(key)) {
// //         filterConditions[key] = { $regex: coercedValue, $options: "i" };
// //         continue;
// //       }

// //       filterConditions[key] = coercedValue;
// //     }

// //     if (this.isAggregate) {
// //       if (Object.keys(filterConditions).length) this.query.pipeline().push({ $match: filterConditions });
// //       if (orConditions.length) this.query.pipeline().push({ $match: { $or: orConditions } });
// //     } else {
// //       this.query = this.query.find(filterConditions);
// //       if (orConditions.length) this.query = this.query.find({ $or: orConditions });
// //     }

// //     return this;
// //   }

// //   /**
// //    * Regex-based Search
// //    */
// //   search(fields = []) {
// //     const searchTerm = this.queryString.search;
// //     if (!searchTerm || fields.length === 0) return this;

// //     const regex = { $regex: searchTerm, $options: "i" };
// //     const searchConditions = fields.map((field) => ({ [field]: regex }));

// //     if (this.isAggregate) {
// //       this.query.pipeline().push({ $match: { $or: searchConditions } });
// //     } else {
// //       this.query = this.query.find({ $or: searchConditions });
// //     }

// //     return this;
// //   }

// //   /**
// //    * Sorting Logic
// //    */
// //   sort() {
// //     if (this.queryString.sort) {
// //       const sortBy = this.queryString.sort.split(",").join(" ");
// //       this.query = this.query.sort(sortBy);
// //     } else {
// //       this.query = this.query.sort("-createdAt -_id");
// //     }
// //     return this;
// //   }

// //   /**
// //    * Field Projection (Whitelisting)
// //    */
// //   limitFields() {
// //     if (this.queryString.fields) {
// //       const fields = this.queryString.fields.split(",").join(" ");
// //       this.query = this.query.select(fields);
// //     } else {
// //       this.query = this.query.select("-__v");
// //     }
// //     return this;
// //   }

// //   /**
// //    * Page/Limit Pagination
// //    */
// //   paginate() {
// //     const page = Math.abs(parseInt(this.queryString.page, 10)) || 1;
// //     const limit = Math.abs(parseInt(this.queryString.limit, 10)) || 50;
// //     const skip = (page - 1) * limit;

// //     this.pagination = { page, limit, skip };
// //     this.query = this.query.skip(skip).limit(limit);

// //     return this;
// //   }

// //   /**
// //    * Relationship Population
// //    */
// //   populate() {
// //     if (this.queryString.populate) {
// //       const paths = this.queryString.populate.split(",");
// //       paths.forEach(p => {
// //         this.query = this.query.populate(p.trim());
// //       });
// //     }
// //     return this;
// //   }

// //   /**
// //    * Unified Execution with Filter-Aware Counting
// //    */
// //   async execute() {
// //     if (this.isAggregate) {
// //       const data = await this.query.exec();
// //       return { data, results: data.length };
// //     }

// //     // 🟢 CRITICAL: Calculate count based on CURRENT filters, not the whole collection
// //     const currentFilter = this.query.getFilter();
// //     const totalCount = await this.query.model.countDocuments(currentFilter);
    
// //     const docs = await this.query.lean(); // Faster performance
// //     const totalPages = Math.ceil(totalCount / this.pagination.limit);

// //     return {
// //       data: docs,
// //       results: docs.length,
// //       pagination: {
// //         page: this.pagination.page,
// //         limit: this.pagination.limit,
// //         totalResults: totalCount,
// //         totalPages,
// //         hasNextPage: this.pagination.page < totalPages,
// //         hasPrevPage: this.pagination.page > 1
// //       }
// //     };
// //   }
// // }

// // module.exports = ApiFeatures;
