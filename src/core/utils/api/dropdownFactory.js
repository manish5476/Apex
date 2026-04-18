'use strict';

const mongoose = require('mongoose');
const catchAsync = require('./catchAsync');
const AppError = require('./appError');

// ─── Regex escape to prevent ReDoS ───────────────────────────────────────────
const escapeRegex = (str) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

// ─── Safe nested field extractor (e.g., 'billing.city') ──────────────────────
const getNestedValue = (obj, path) => {
  if (typeof path !== 'string') return null;
  return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? null;
};

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
function buildSelectString(labelFields = [], valueField = '_id', metaFields = []) {
  const fields = new Set(['_id', ...labelFields, ...metaFields]);
  if (valueField !== '_id' && typeof valueField === 'string') fields.add(valueField);
  const rootFields = [...fields].filter(f => typeof f === 'string').map(f => f.split('.')[0]);
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

    const valueField = req.query.valueField || defaultValueField;

    // ── 4. Field resolution ───────────────────────────────────────────────────
    const searchField = req.query.searchField || defaultSearchField;
    
    // ✅ Extract fields from template if it exists
    const templateFields = labelTemplate 
      ? (labelTemplate.match(/\{\{(\w+(?:\.\w+)*)\}\}/g) || []).map(s => s.slice(2, -2))
      : [];

    const labelFields = typeof req.query.labelField === 'string'
      ? req.query.labelField.split(',')
      : [...new Set([...(Array.isArray(defaultLabelField) ? defaultLabelField : [defaultLabelField]), ...templateFields])];


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
        ? Model.countDocuments(filter)
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

// npx jest tests/dropdown.test.js --runInBand --forceExit
