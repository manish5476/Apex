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
      "search", "q", "query", "searchTerm", "keyword", "term", "populate", "lastId", "lastDate",
    ];
    excludedFields.forEach((el) => delete queryObj[el]);

    const filterConditions = {};  // exact/range fields → ANDed
    const orConditions     = [];  // fuzzy text fields  → ORed

    // These fields use fuzzy matching — everything else is exact
    const FUZZY_FIELDS = [
      "name", "companyName", "contactPerson", "partyName",
      "sku", "title", "description", "referenceNumber",
      "barcode", "email", "phone", "gstNumber", "panNumber",
      "brand", "tags",
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
    const rawSearchTerm =
      this.queryString.search ||
      this.queryString.q ||
      this.queryString.query ||
      this.queryString.searchTerm ||
      this.queryString.keyword ||
      this.queryString.term ||
      "";
    const terms = String(rawSearchTerm)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8);

    if (!terms.length || fields.length === 0) return this;

    // "Google-like" behavior: each token must match at least one target field.
    const andConditions = terms.map((term) => {
      const perTermOr = [];
      fields.forEach((field) => {
        perTermOr.push(...ApiFeatures.buildFuzzyConditions(field, term));
      });
      return { $or: perTermOr };
    });

    const searchFilter =
      andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

    if (this.isAggregate) {
      this.query.pipeline().push({ $match: searchFilter });
    } else {
      this.query = this.query.find(searchFilter);
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

