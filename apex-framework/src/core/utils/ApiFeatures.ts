import mongoose, { Aggregate, Document, HydratedDocument, Query } from 'mongoose';

export interface ApiFeaturesPagination {
  page: number;
  limit: number;
  totalResults: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ApiFeaturesResult<T> {
  data: T[];
  results: number;
  pagination?: ApiFeaturesPagination;
}

export type ApiFeaturesQueryParams = Record<string, unknown>;

interface SmartPatterns {
  exact: string;
  typo: string;
  subsequence: string;
}

type FuzzyCondition = Record<string, { $regex: string; $options: string }>;

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║                        ApiFeatures                              ║
 * ║  Standardized query builder for Mongoose & Aggregation.         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Direct TypeScript port — every rule, comment, and behavior preserved
 * exactly from the original JS, including the smart fuzzy matching
 * strategy (exact → typo-tolerant → subsequence).
 */
export class ApiFeatures<T extends Document = Document> {
  private query: Query<HydratedDocument<T>[], T> | Aggregate<Record<string, unknown>[]>;
  private readonly queryString: ApiFeaturesQueryParams;
  private readonly isAggregate: boolean;
  private pagination: { page?: number; limit?: number; skip?: number } = {};

  constructor(
    query: Query<HydratedDocument<T>[], T> | Aggregate<Record<string, unknown>[]>,
    queryString: ApiFeaturesQueryParams,
    isAggregate = false
  ) {
    this.query = query;
    this.queryString = queryString;
    this.isAggregate = isAggregate;
  }

  // ── 1. TYPE COERCION ──────────────────────────────────────────────
  static coerceValue(value: unknown): unknown {
    if (typeof value !== 'string') return value;

    const lowerVal = value.toLowerCase().trim();

    if (lowerVal === 'true') return true;
    if (lowerVal === 'false') return false;
    if (lowerVal === 'null') return null;

    if (value.trim() !== '' && !isNaN(Number(value)) && value.length < 12 && !value.startsWith('0x')) {
      return Number(value);
    }

    if (/^[0-9a-fA-F]{24}$/.test(value)) {
      return new mongoose.Types.ObjectId(value);
    }

    const d = new Date(value);
    if (!isNaN(d.getTime()) && value.includes('-')) return d;

    return value;
  }

  // ── 2. SMART FUZZY PATTERN BUILDER ────────────────────────────────
  static buildSmartPatterns(term: string): SmartPatterns | null {
    if (!term || typeof term !== 'string') return null;

    const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const chars = term.split('').map(escape);

    return {
      exact: escape(term),
      typo: chars.join('.?'),
      subsequence: chars.join('.*'),
    };
  }

  static buildFuzzyConditions(field: string, term: string): FuzzyCondition[] {
    const patterns = ApiFeatures.buildSmartPatterns(term);
    if (!patterns) return [];

    return [
      { [field]: { $regex: patterns.exact, $options: 'i' } },
      { [field]: { $regex: patterns.typo, $options: 'i' } },
      { [field]: { $regex: patterns.subsequence, $options: 'i' } },
    ];
  }

  // ── 3. FILTER ──────────────────────────────────────────────────────
  filter(): this {
    const queryObj: Record<string, unknown> = { ...this.queryString };

    const excludedFields = [
      'page', 'sort', 'limit', 'fields',
      'search', 'q', 'query', 'searchTerm', 'keyword', 'term', 'populate', 'lastId', 'lastDate',
    ];
    excludedFields.forEach((el) => delete queryObj[el]);

    const filterConditions: Record<string, unknown> = {};
    const orConditions: FuzzyCondition[] = [];

    const FUZZY_FIELDS = [
      'name', 'companyName', 'contactPerson', 'partyName',
      'sku', 'title', 'description', 'referenceNumber',
      'barcode', 'email', 'phone', 'gstNumber', 'panNumber',
      'brand', 'tags',
    ];

    for (const key in queryObj) {
      const value = queryObj[key];

      if (value === '' || value === null || value === undefined) continue;

      // ?category[or]=electronics,books
      if (key.endsWith('[or]')) {
        const field = key.replace('[or]', '');
        const values = String(value)
          .split(',')
          .map((v) => ApiFeatures.coerceValue(v.trim()));
        orConditions.push({ [field]: { $in: values } } as unknown as FuzzyCondition);
        continue;
      }

      // ?status=active|pending
      if (typeof value === 'string' && value.includes('|')) {
        filterConditions[key] = {
          $in: value.split('|').map((v) => ApiFeatures.coerceValue(v.trim())),
        };
        continue;
      }

      // ?price[gte]=100&price[lte]=500
      if (typeof value === 'object' && value !== null) {
        const rangeObj: Record<string, unknown> = {};
        for (const op in value as Record<string, unknown>) {
          rangeObj[`$${op}`] = ApiFeatures.coerceValue((value as Record<string, unknown>)[op]);
        }
        filterConditions[key] = rangeObj;
        continue;
      }

      const coercedValue = ApiFeatures.coerceValue(value);

      if (typeof coercedValue === 'string' && FUZZY_FIELDS.includes(key)) {
        orConditions.push(...ApiFeatures.buildFuzzyConditions(key, coercedValue));
        continue;
      }

      filterConditions[key] = coercedValue;
    }

    if (this.isAggregate) {
      const agg = this.query as Aggregate<Record<string, unknown>[]>;
      if (Object.keys(filterConditions).length) {
        agg.pipeline().push({ $match: filterConditions });
      }
      if (orConditions.length) {
        agg.pipeline().push({ $match: { $or: orConditions } });
      }
    } else {
      let q = this.query as Query<HydratedDocument<T>[], T>;
      if (Object.keys(filterConditions).length) {
        q = q.find(filterConditions);
      }
      if (orConditions.length) {
        q = q.find({ $or: orConditions } as Record<string, unknown>);
      }
      this.query = q;
    }

    return this;
  }

  // ── 4. SEARCH (?search=term) ──────────────────────────────────────
  search(fields: string[] = []): this {
    const rawSearchTerm =
      (this.queryString.search as string) ||
      (this.queryString.q as string) ||
      (this.queryString.query as string) ||
      (this.queryString.searchTerm as string) ||
      (this.queryString.keyword as string) ||
      (this.queryString.term as string) ||
      '';

    const terms = String(rawSearchTerm).trim().split(/\s+/).filter(Boolean).slice(0, 8);

    if (!terms.length || fields.length === 0) return this;

    const andConditions = terms.map((term) => {
      const perTermOr: FuzzyCondition[] = [];
      fields.forEach((field) => {
        perTermOr.push(...ApiFeatures.buildFuzzyConditions(field, term));
      });
      return { $or: perTermOr };
    });

    const searchFilter = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

    if (this.isAggregate) {
      (this.query as Aggregate<Record<string, unknown>[]>).pipeline().push({ $match: searchFilter });
    } else {
      this.query = (this.query as Query<HydratedDocument<T>[], T>).find(
        searchFilter as Record<string, unknown>
      );
    }

    return this;
  }

  // ── 5. SORT ────────────────────────────────────────────────────────
  sort(): this {
    if (!this.isAggregate) {
      const q = this.query as Query<HydratedDocument<T>[], T>;
      if (this.queryString.sort) {
        const sortBy = String(this.queryString.sort).split(',').join(' ');
        this.query = q.sort(sortBy);
      } else {
        this.query = q.sort('-createdAt -_id');
      }
    }
    return this;
  }

  // ── 6. FIELD LIMITING / PROJECTION ────────────────────────────────
  limitFields(): this {
    if (!this.isAggregate) {
      const q = this.query as Query<HydratedDocument<T>[], T>;
      if (this.queryString.fields) {
        const fields = String(this.queryString.fields).split(',').join(' ');
        this.query = q.select(fields);
      } else {
        this.query = q.select('-__v');
      }
    }
    return this;
  }

  // ── 7. PAGINATION ─────────────────────────────────────────────────
  paginate(): this {
    const page = Math.abs(parseInt(String(this.queryString.page), 10)) || 1;
    const limit = Math.abs(parseInt(String(this.queryString.limit), 10)) || 50;
    const skip = (page - 1) * limit;

    this.pagination = { page, limit, skip };

    if (!this.isAggregate) {
      const q = this.query as Query<HydratedDocument<T>[], T>;
      this.query = q.skip(skip).limit(limit);
    }

    return this;
  }

  // ── 8. POPULATE ────────────────────────────────────────────────────
  populate(): this {
    if (!this.isAggregate && this.queryString.populate) {
      const paths = String(this.queryString.populate).split(',');
      let q = this.query as Query<HydratedDocument<T>[], T>;
      paths.forEach((p) => {
        q = q.populate(p.trim());
      });
      this.query = q;
    }
    return this;
  }

  // ── 9. EXECUTE ─────────────────────────────────────────────────────
  async execute(): Promise<ApiFeaturesResult<HydratedDocument<T>> | ApiFeaturesResult<Record<string, unknown>>> {
    if (this.isAggregate) {
      const agg = this.query as Aggregate<Record<string, unknown>[]>;
      const data = await agg.exec();
      return { data, results: data.length };
    }

    const q = this.query as Query<HydratedDocument<T>[], T>;
    const currentFilter = q.getFilter();
    const totalCount = await q.model.countDocuments(currentFilter);

    const docs = await q.lean<HydratedDocument<T>[]>();
    const limit = this.pagination.limit ?? 50;
    const page = this.pagination.page ?? 1;
    const totalPages = Math.ceil(totalCount / limit);

    return {
      data: docs,
      results: docs.length,
      pagination: {
        page,
        limit,
        totalResults: totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /** Exposes the underlying query — needed by handlerFactory for population, limits, etc. */
  getQuery(): Query<HydratedDocument<T>[], T> | Aggregate<Record<string, unknown>[]> {
    return this.query;
  }

  setQuery(query: Query<HydratedDocument<T>[], T>): void {
    this.query = query;
  }
}