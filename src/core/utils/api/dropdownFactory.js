'use strict';

const mongoose = require('mongoose');
const catchAsync = require('./catchAsync');
const AppError = require('./appError');

// ─── Regex escape to prevent ReDoS ───────────────────────────────────────────
const escapeRegex = (str) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

// ─── Safe nested field extractor (e.g., 'billing.city') ──────────────────────
const getNestedValue = (obj, path) =>
  path.split('.').reduce((acc, key) => acc?.[key], obj) ?? null;

// ─── Build a display label from one or more fields ───────────────────────────
const buildLabel = (doc, labelFields, labelTemplate) => {
  if (labelTemplate) {
    return labelTemplate.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) =>
      getNestedValue(doc, path) ?? ''
    );
  }
  const fields = Array.isArray(labelFields) ? labelFields : [labelFields];
  const [primary, ...extras] = fields.map(f => getNestedValue(doc, f)).filter(Boolean);
  return extras.length ? `${primary} (${extras.join(' · ')})` : primary ?? 'Unknown';
};

// ─── Internal: build a lean .select() string from all needed fields ───────────
function buildSelectString(labelFields, valueField, metaFields) {
  const fields = new Set(['_id', ...labelFields, ...metaFields]);
  if (valueField !== '_id') fields.add(valueField);
  const rootFields = [...fields].map(f => f.split('.')[0]);
  return [...new Set(rootFields)].join(' ');
}

/**
 * ============================================================================
 * dropdownFactory.getDropdownList
 * ============================================================================
 */
exports.getDropdownList = (Model, options = {}) => {
  // ✅ FIX 1: Validate model at definition time — no longer swallowed
  if (!Model || !Model.schema) {
    throw new Error(`dropdownFactory: Invalid Model provided`);
  }

  const {
    defaultSearchField = 'name',
    defaultLabelField = 'name',
    defaultValueField = '_id',
    labelTemplate = null,
    metaFields = [],
    extraFilter = {},
    populate = null,
    maxLimit = 200,
    allowStatusFilter = false,
    allowedFilters = [],
  } = options;

  // Pre-check schema guards once, not per request
  const hasIsDeleted = !!Model.schema.path('isDeleted');
  const hasIsActive = !!Model.schema.path('isActive');

  return catchAsync(async (req, res, next) => {
    // ── 1. Tenant isolation ───────────────────────────────────────────────────
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Unauthorized: missing organization context', 401));

    const filter = {
      organizationId: orgId,
      ...extraFilter,
    };

    // ── 1b. Dynamic query filters ─────────────────────────────────────────────
    // ✅ FIX 4: Coerce ObjectId strings so relational filters don't silently fail
    allowedFilters.forEach(field => {
      const val = req.query[field];
      if (val !== undefined && val !== null && val !== '') {
        filter[field] = mongoose.isValidObjectId(val)
          ? new mongoose.Types.ObjectId(val)
          : val;
      }
    });

    // ── 2. Soft-delete & active guard ─────────────────────────────────────────
    if (hasIsDeleted) filter.isDeleted = { $ne: true };

    if (hasIsActive) {
      if (allowStatusFilter && req.query.isActive === 'all') {
        // No filter — return all including inactive
      } else if (allowStatusFilter && req.query.isActive === 'false') {
        filter.isActive = false;
      } else {
        filter.isActive = { $ne: false };
      }
    }

    // ── 3. Parse & validate pagination params ─────────────────────────────────
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const requestedLimit = parseInt(req.query.limit, 10) || 50;
    const limit = Math.min(Math.max(requestedLimit, 1), maxLimit);
    const skip = (page - 1) * limit;

    // ── 4. Field resolution ───────────────────────────────────────────────────
    const searchField = req.query.searchField || defaultSearchField;
    const labelFields = req.query.labelField
      ? req.query.labelField.split(',')
      : Array.isArray(defaultLabelField)
        ? defaultLabelField
        : [defaultLabelField];
    const valueField = req.query.valueField || defaultValueField;

    // ── 5. Search filter ──────────────────────────────────────────────────────
    const searchTerm = req.query.search?.trim() || '';
    if (searchTerm) {
      if (!Model.schema.path(searchField)) {
        return next(new AppError(`Field '${searchField}' does not exist on this resource`, 400));
      }
      filter[searchField] = { $regex: escapeRegex(searchTerm), $options: 'i' };
    }

    // ── 6. Exclusion filter ───────────────────────────────────────────────────
    if (req.query.excludeIds) {
      const excludeIds = req.query.excludeIds
        .split(',')
        .filter(id => mongoose.isValidObjectId(id))
        .map(id => new mongoose.Types.ObjectId(id));
      if (excludeIds.length) {
        filter._id = { ...(filter._id || {}), $nin: excludeIds };
      }
    }

    // ── 7. Pre-selected ID hydration ──────────────────────────────────────────
    // ✅ FIX 2: Removed `&& !searchTerm` guard — pre-selected docs must always
    // come through regardless of what the user is searching, so selected chips
    // never disappear from the list mid-search.
    // Also uses a MINIMAL filter (org + id only) — not the full search filter —
    // so they always resolve even if they wouldn't match the current search term.
    let preSelectedDocs = [];
    if (req.query.includeIds) {
      const includeIds = req.query.includeIds
        .split(',')
        .filter(id => mongoose.isValidObjectId(id))
        .map(id => new mongoose.Types.ObjectId(id));

      if (includeIds.length) {
        const preFilter = {
          organizationId: orgId,
          _id: { $in: includeIds },
          ...(hasIsDeleted ? { isDeleted: { $ne: true } } : {}),
          // ✅ Intentionally omits: searchTerm, isActive, extraFilter, allowedFilters
          // Pre-selected docs must resolve by ID alone — no other filter should
          // prevent a saved value from appearing on form edit/load.
        };

        const selectFields = buildSelectString(labelFields, valueField, metaFields);
        let preQuery = Model.find(preFilter).select(selectFields).lean();
        if (populate) preQuery = preQuery.populate(populate);
        preSelectedDocs = await preQuery;
      }
    }

    // ── 8. Sorting ────────────────────────────────────────────────────────────
    const sortBy = req.query.sortBy || labelFields[0];
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    // ── 9. Main query ─────────────────────────────────────────────────────────
    const selectString = buildSelectString(labelFields, valueField, metaFields);

    let mainQuery = Model.find(filter)
      .select(selectString)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    if (populate) mainQuery = mainQuery.populate(populate);

    // ✅ FIX 3: Skip countDocuments on pages > 1 — infinite scroll only needs
    // the count on the first load to know total and whether hasMore is reliable.
    // On subsequent scroll pages, we derive hasMore from result length alone.
    const shouldCount = page === 1;

    const [rawResults, total] = await Promise.all([
      mainQuery,
      shouldCount
        ? (searchTerm ? Model.countDocuments(filter) : Model.estimatedDocumentCount({ organizationId: orgId }))
        : Promise.resolve(null),
    ]);

    // ── 10. Merge pre-selected docs without duplicates ────────────────────────
    const preSelectedIds = new Set(preSelectedDocs.map(d => d._id.toString()));
    const mergedResults = [
      ...preSelectedDocs,
      ...rawResults.filter(d => !preSelectedIds.has(d._id.toString())),
    ];

    // ── 11. Transform to { label, value, meta?, data } ───────────────────────
    const data = mergedResults.map(doc => {
      const result = {
        label: buildLabel(doc, labelFields, labelTemplate),
        value: valueField === '_id' ? doc._id : getNestedValue(doc, valueField),
        data: doc,
      };

      if (metaFields.length) {
        result.meta = metaFields.reduce((acc, field) => {
          acc[field] = getNestedValue(doc, field);
          return acc;
        }, {});
      }

      return result;
    });

    // ── 12. Response ──────────────────────────────────────────────────────────
    // When page > 1, total is null — derive hasMore from whether we got a full page
    const computedTotal = total ?? -1;
    const hasMore = shouldCount
      ? page * limit < computedTotal
      : rawResults.length === limit;

    res.status(200).json({
      status: 'success',
      results: data.length,
      total: computedTotal === -1 ? undefined : computedTotal,
      page,
      totalPages: shouldCount ? Math.ceil(computedTotal / limit) : undefined,
      hasMore,
      data,
    });
  });
};


// 'use strict';

// const mongoose = require('mongoose');
// const catchAsync = require('./catchAsync');
// const AppError = require('./appError');

// // ─── Regex escape to prevent ReDoS ───────────────────────────────────────────
// const escapeRegex = (str) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

// // ─── Safe nested field extractor (e.g., 'billing.city') ──────────────────────
// const getNestedValue = (obj, path) =>
//   path.split('.').reduce((acc, key) => acc?.[key], obj) ?? null;

// // ─── Build a display label from one or more fields ───────────────────────────
// // e.g., labelFields: ['name', 'phone'] => "John Doe (9876543210)"
// const buildLabel = (doc, labelFields, labelTemplate) => {
//   if (labelTemplate) {
//     // Template mode: "{{name}} — {{phone}}"
//     return labelTemplate.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) =>
//       getNestedValue(doc, path) ?? ''
//     );
//   }
//   const fields = Array.isArray(labelFields) ? labelFields : [labelFields];
//   const [primary, ...extras] = fields.map(f => getNestedValue(doc, f)).filter(Boolean);
//   return extras.length ? `${primary} (${extras.join(' · ')})` : primary ?? 'Unknown';
// };

// /**
//  * ============================================================================
//  * dropdownFactory.getDropdownList
//  *
//  * A generic, multi-tenant-safe dropdown factory for any Mongoose model.
//  *
//  * WHAT IT DOES:
//  *  - Enforces org-level tenant isolation on every query
//  *  - Supports search, pagination, pre-selected ID hydration, extra filters,
//  *    multi-field labels, field projections, and population
//  *  - Returns strict { label, value, meta? } pairs for UI frameworks
//  *
//  * OPTIONS (set at route definition time):
//  *  @param {Model}    Model                   Mongoose model
//  *  @param {object}   options
//  *  @param {string}   options.defaultSearchField  Field to search in (default: 'name')
//  *  @param {string|string[]} options.defaultLabelField  Field(s) for display label
//  *  @param {string}   options.defaultValueField   Field to use as value (default: '_id')
//  *  @param {string}   options.labelTemplate       Handlebars-style template: "{{name}} ({{phone}})"
//  *  @param {string[]} options.metaFields          Extra fields to include in each result object
//  *  @param {object}   options.extraFilter         Static extra filters always applied
//  *  @param {object|string} options.populate       Mongoose populate config
//  *  @param {number}   options.maxLimit            Hard cap on limit (default: 200)
//  *  @param {boolean}  options.allowStatusFilter   Allow frontend to override status filter (default: false)
//  *
//  * QUERY PARAMS (sent by frontend at runtime):
//  *  @param {string}   search         Search term
//  *  @param {number}   page           Page number (default: 1)
//  *  @param {number}   limit          Page size (default: 50, capped by maxLimit)
//  *  @param {string}   includeIds     Comma-separated _ids to always include (for pre-selected values)
//  *  @param {string}   excludeIds     Comma-separated _ids to always exclude
//  *  @param {string}   searchField    Override search field at runtime
//  *  @param {string}   labelField     Override label field at runtime
//  *  @param {string}   valueField     Override value field at runtime
//  *  @param {string}   sortBy         Field to sort by (default: labelField)
//  *  @param {string}   sortOrder      'asc' | 'desc' (default: 'asc')
//  *  @param {string}   isActive       Filter by isActive: 'true' | 'false' | 'all'
//  * ============================================================================
//  */
// exports.getDropdownList = (Model, options = {}) => {
//   // ── Validate model at definition time, not per-request ─────────────────────
//   if (!Model || !Model.schema) {
//     // throw new Error(`dropdownFactory: Invalid Model provided —  'Unknown'}`);
//   }

//   const {
//     defaultSearchField = 'name',
//     defaultLabelField = 'name',
//     defaultValueField = '_id',
//     labelTemplate = null,
//     metaFields = [],
//     extraFilter = {},
//     populate = null,
//     maxLimit = 200,
//     allowStatusFilter = false,
//     allowedFilters = [],
//   } = options;

//   // Pre-check which schema guards exist (done once, not per request)
//   const hasIsDeleted = !!Model.schema.path('isDeleted');
//   const hasIsActive = !!Model.schema.path('isActive');

//   return catchAsync(async (req, res, next) => {
//     // ── 1. Tenant isolation — non-negotiable ──────────────────────────────────
//     const orgId = req.user?.organizationId;
//     if (!orgId) return next(new AppError('Unauthorized: missing organization context', 401));

//     const filter = {
//       organizationId: orgId,
//       ...extraFilter,  // static extra filters from route definition
//     };

//     // ── 1b. Dynamic query filters ─────────────────────────────────────────────
//     allowedFilters.forEach(field => {
//       if (req.query[field]) {
//         filter[field] = req.query[field];
//       }
//     });

//     // ── 2. Soft-delete & active guard ─────────────────────────────────────────
//     if (hasIsDeleted) filter.isDeleted = { $ne: true };

//     if (hasIsActive) {
//       if (allowStatusFilter && req.query.isActive === 'all') {
//         // No filter — return all including inactive
//       } else if (allowStatusFilter && req.query.isActive === 'false') {
//         filter.isActive = false;
//       } else {
//         filter.isActive = { $ne: false }; // Default: active only
//       }
//     }

//     // ── 3. Parse & validate pagination params ─────────────────────────────────
//     const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
//     const requestedLimit = parseInt(req.query.limit, 10) || 50;
//     const limit = Math.min(Math.max(requestedLimit, 1), maxLimit); // clamp [1, maxLimit]
//     const skip = (page - 1) * limit;

//     // ── 4. Field resolution ───────────────────────────────────────────────────
//     const searchField = req.query.searchField || defaultSearchField;
//     const labelFields = req.query.labelField
//       ? req.query.labelField.split(',')
//       : Array.isArray(defaultLabelField)
//         ? defaultLabelField
//         : [defaultLabelField];
//     const valueField = req.query.valueField || defaultValueField;

//     // ── 5. Search filter ──────────────────────────────────────────────────────
//     const searchTerm = req.query.search?.trim() || '';
//     if (searchTerm) {
//       if (!Model.schema.path(searchField)) {
//         return next(new AppError(`Field '${searchField}' does not exist on this resource`, 400));
//       }
//       filter[searchField] = { $regex: escapeRegex(searchTerm), $options: 'i' };
//     }

//     // ── 6. Exclusion filter ───────────────────────────────────────────────────
//     // Useful when editing a record and you want to exclude the current record
//     // from its own "parent" dropdown (e.g., prevent self-reference)
//     if (req.query.excludeIds) {
//       const excludeIds = req.query.excludeIds
//         .split(',')
//         .filter(id => mongoose.isValidObjectId(id))
//         .map(id => new mongoose.Types.ObjectId(id));
//       if (excludeIds.length) {
//         filter._id = { ...(filter._id || {}), $nin: excludeIds };
//       }
//     }

//     // ── 7. Pre-selected ID hydration (critical for virtual scrolling UX) ──────
//     // Problem: User saved a record with customerId = "abc123". That customer
//     // might be on page 7 of the dropdown. On edit, we need to show it.
//     // Solution: Run a SEPARATE query to fetch just those IDs, then merge results.
//     let preSelectedDocs = [];
//     if (req.query.includeIds && !searchTerm) {
//       const includeIds = req.query.includeIds
//         .split(',')
//         .filter(id => mongoose.isValidObjectId(id))
//         .map(id => new mongoose.Types.ObjectId(id));

//       if (includeIds.length) {
//         // Only fetch what the current filter allows — still tenant-safe
//         const preFilter = { ...filter, _id: { $in: includeIds } };
//         const selectFields = buildSelectString(labelFields, valueField, metaFields);

//         let preQuery = Model.find(preFilter).select(selectFields).lean();
//         if (populate) preQuery = preQuery.populate(populate);
//         preSelectedDocs = await preQuery;
//       }
//     }

//     // ── 8. Sorting ────────────────────────────────────────────────────────────
//     const sortBy = req.query.sortBy || labelFields[0];
//     const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

//     // ── 9. Main query — only select fields we actually need ───────────────────
//     const selectString = buildSelectString(labelFields, valueField, metaFields);

//     let mainQuery = Model.find(filter)
//       .select(selectString)
//       .sort({ [sortBy]: sortOrder })
//       .skip(skip)
//       .limit(limit)
//       .lean();

//     if (populate) mainQuery = mainQuery.populate(populate);

//     // Run main query and count in parallel
//     const [rawResults, total] = await Promise.all([
//       mainQuery,
//       Model.countDocuments(filter),
//     ]);

//     // ── 10. Merge pre-selected docs without duplicates ────────────────────────
//     const preSelectedIds = new Set(preSelectedDocs.map(d => d._id.toString()));
//     const mergedResults = [
//       ...preSelectedDocs,
//       ...rawResults.filter(d => !preSelectedIds.has(d._id.toString())),
//     ];

//     // ── 11. Transform to { label, value, meta? } ─────────────────────────────
//     const data = mergedResults.map(doc => {
//       const result = {
//         label: buildLabel(doc, labelFields, labelTemplate),
//         value: valueField === '_id' ? doc._id : getNestedValue(doc, valueField),
//       };

//       // Attach optional meta fields for display in dropdown option slots
//       if (metaFields.length) {
//         result.meta = metaFields.reduce((acc, field) => {
//           acc[field] = getNestedValue(doc, field);
//           return acc;
//         }, {});
//       }

//       result.data = doc; // ✅ Pass full doc for complex form logic
//       return result;
//     });

//     // ── 12. Response ──────────────────────────────────────────────────────────
//     res.status(200).json({
//       status: 'success',
//       results: data.length,
//       total,               // total matching docs (for pagination UI)
//       page,
//       totalPages: Math.ceil(total / limit),
//       hasMore: page * limit < total, // convenience flag for infinite scroll
//       data,
//     });
//   });
// };

// // ─── Internal: build a lean .select() string from all needed fields ───────────
// function buildSelectString(labelFields, valueField, metaFields) {
//   const fields = new Set(['_id', ...labelFields, ...metaFields]);
//   if (valueField !== '_id') fields.add(valueField);
//   // Flatten nested paths to their root (e.g., 'billing.city' → 'billing')
//   const rootFields = [...fields].map(f => f.split('.')[0]);
//   return [...new Set(rootFields)].join(' ');
// }

