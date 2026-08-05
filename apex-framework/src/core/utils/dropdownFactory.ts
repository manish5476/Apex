import { Response } from 'express';
import mongoose, { Document, Model, PopulateOptions } from 'mongoose';
import { catchAsync } from '../http';
import { ApiError } from '../errors';
import { AuthenticatedRequest } from '../http/types';

const escapeRegex = (str: string): string => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

function getNestedValue(obj: unknown, path: string): unknown {
  if (typeof path !== 'string') return null;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj) ?? null;
}

function buildLabel(
  doc: Record<string, unknown>,
  labelFields: string | string[],
  labelTemplate: string | null
): string {
  if (labelTemplate) {
    return labelTemplate.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path: string) =>
      String(getNestedValue(doc, path) ?? '')
    );
  }
  const fields = Array.isArray(labelFields) ? labelFields : [labelFields];
  const values = fields.map((f) => getNestedValue(doc, f)).filter(Boolean) as string[];
  const [primary, ...extras] = values;
  return extras.length ? `${primary} (${extras.join(' · ')})` : primary ?? 'Unknown';
}

function buildSelectString(
  labelFields: string[] = [],
  valueField: string = '_id',
  metaFields: string[] = []
): string {
  const fields = new Set<string>(['_id', ...labelFields, ...metaFields]);
  if (valueField !== '_id') fields.add(valueField);
  const rootFields = [...fields].map((f) => f.split('.')[0]);
  return [...new Set(rootFields)].join(' ');
}

export interface DropdownFactoryOptions {
  defaultSearchField?: string;
  defaultLabelField?: string | string[];
  defaultValueField?: string;
  labelTemplate?: string | null;
  metaFields?: string[];
  extraFilter?: Record<string, unknown>;
  populate?: PopulateOptions | PopulateOptions[] | string;
  maxLimit?: number;
  allowStatusFilter?: boolean;
  allowedFilters?: string[];
}

interface DropdownDoc {
  _id: mongoose.Types.ObjectId;
  [key: string]: unknown;
}

/**
 * ============================================================================
 * dropdownFactory.getDropdownList
 * ============================================================================
 * Direct TypeScript port — every fix comment from the original JS preserved.
 */
export function getDropdownList<T extends Document>(SchemaModel: Model<T>, options: DropdownFactoryOptions = {}) {
  // ✅ FIX 1: Validate model at definition time — no longer swallowed
  if (!SchemaModel || !SchemaModel.schema) {
    throw new Error('dropdownFactory: Invalid Model provided');
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

  const hasIsDeleted = !!SchemaModel.schema.path('isDeleted');
  const hasIsActive = !!SchemaModel.schema.path('isActive');

  return catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    // ── 1. Tenant isolation ──────────────────────────────────────────
    const orgId = req.user?.organizationId;
    if (!orgId) throw ApiError.unauthorized('Unauthorized: missing organization context');

    const filter: Record<string, unknown> = {
      organizationId: orgId,
      ...extraFilter,
    };

    // ── 1b. Dynamic query filters ────────────────────────────────────
    // ✅ FIX 4: Coerce ObjectId strings so relational filters don't silently fail
    allowedFilters.forEach((field) => {
      const val = req.query[field] as string | undefined;
      if (val !== undefined && val !== null && val !== '') {
        filter[field] = mongoose.isValidObjectId(val) ? new mongoose.Types.ObjectId(val) : val;
      }
    });

    // ── 2. Soft-delete & active guard ────────────────────────────────
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

    // ── 3. Parse & validate pagination params ────────────────────────
    const page = Math.max(parseInt(String(req.query.page), 10) || 1, 1);
    const requestedLimit = parseInt(String(req.query.limit), 10) || 50;
    const limit = Math.min(Math.max(requestedLimit, 1), maxLimit);
    const skip = (page - 1) * limit;

    const valueField = (req.query.valueField as string) || defaultValueField;

    // ── 4. Field resolution ──────────────────────────────────────────
    const searchField = (req.query.searchField as string) || defaultSearchField;

    const templateFields = labelTemplate
      ? (labelTemplate.match(/\{\{(\w+(?:\.\w+)*)\}\}/g) || []).map((s) => s.slice(2, -2))
      : [];

    const labelFields =
      typeof req.query.labelField === 'string'
        ? (req.query.labelField as string).split(',')
        : [...new Set([...(Array.isArray(defaultLabelField) ? defaultLabelField : [defaultLabelField]), ...templateFields])];

    // ── 5. Search filter ─────────────────────────────────────────────
    const searchTerm = (req.query.search as string)?.trim() || '';
    if (searchTerm) {
      if (!SchemaModel.schema.path(searchField)) {
        throw ApiError.badRequest(`Field '${searchField}' does not exist on this resource`);
      }
      filter[searchField] = { $regex: escapeRegex(searchTerm), $options: 'i' };
    }

    // ── 6. Exclusion filter ──────────────────────────────────────────
    if (req.query.excludeIds) {
      const excludeIds = String(req.query.excludeIds)
        .split(',')
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      if (excludeIds.length) {
        filter._id = { ...((filter._id as Record<string, unknown>) || {}), $nin: excludeIds };
      }
    }

    // ── 7. Pre-selected ID hydration ─────────────────────────────────
    // ✅ FIX 2: Pre-selected docs must always come through regardless of
    // search term, so selected chips never disappear mid-search.
    let preSelectedDocs: DropdownDoc[] = [];
    if (req.query.includeIds) {
      const includeIds = String(req.query.includeIds)
        .split(',')
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));

      if (includeIds.length) {
        const preFilter: Record<string, unknown> = {
          organizationId: orgId,
          _id: { $in: includeIds },
          ...(hasIsDeleted ? { isDeleted: { $ne: true } } : {}),
        };

        const selectFields = buildSelectString(labelFields, valueField, metaFields);
        let preQuery = SchemaModel.find(preFilter).select(selectFields).lean();
        if (populate) preQuery = preQuery.populate(populate);
        preSelectedDocs = (await preQuery) as unknown as DropdownDoc[];
      }
    }

    // ── 8. Sorting ────────────────────────────────────────────────────
    const sortBy = (req.query.sortBy as string) || labelFields[0];
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    // ── 9. Main query ─────────────────────────────────────────────────
    const selectString = buildSelectString(labelFields, valueField, metaFields);

    let mainQuery = SchemaModel.find(filter)
      .select(selectString)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    if (populate) mainQuery = mainQuery.populate(populate);

    // ✅ FIX 3: Skip countDocuments on pages > 1
    const shouldCount = page === 1;

    const [rawResults, total] = await Promise.all([
      mainQuery as unknown as Promise<DropdownDoc[]>,
      shouldCount ? SchemaModel.countDocuments(filter) : Promise.resolve(null),
    ]);

    // ── 10. Merge pre-selected docs without duplicates ─────────────────
    const preSelectedIds = new Set(preSelectedDocs.map((d) => d._id.toString()));
    const mergedResults = [...preSelectedDocs, ...rawResults.filter((d) => !preSelectedIds.has(d._id.toString()))];

    // ── 11. Transform to { label, value, meta?, data } ────────────────
    const data = mergedResults.map((doc) => {
      const result: {
        label: string;
        value: unknown;
        data: DropdownDoc;
        meta?: Record<string, unknown>;
      } = {
        label: buildLabel(doc, labelFields, labelTemplate),
        value: valueField === '_id' ? doc._id : getNestedValue(doc, valueField),
        data: doc,
      };

      if (metaFields.length) {
        result.meta = metaFields.reduce<Record<string, unknown>>((acc, field) => {
          acc[field] = getNestedValue(doc, field);
          return acc;
        }, {});
      }

      return result;
    });

    // ── 12. Response ──────────────────────────────────────────────────
    const computedTotal = total ?? -1;
    const hasMore = shouldCount ? page * limit < computedTotal : rawResults.length === limit;

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
}