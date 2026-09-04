import { NextFunction, Response } from 'express';
import ExcelJS from 'exceljs';
import { Document, HydratedDocument, Model, PopulateOptions } from 'mongoose';
import { catchAsync } from '../http';
import { ApiError } from '../errors';
import { ApiFeatures, ApiFeaturesQueryParams } from './ApiFeatures';
import { AuthenticatedRequest } from '../http/types';

export interface HandlerFactoryOptions<T> {
  searchFields?: string[];
  populate?: PopulateOptions | PopulateOptions[] | string;
  includeInactive?: boolean;
  dateField?: string;
  exportFields?: Array<{ header: string; key: string; width?: number }>;
  fileName?: string;
  sheetName?: string;
}

const DEFAULT_SEARCH_CANDIDATES = [
  'name', 'companyName', 'partyName', 'contactPerson',
  'phone', 'email', 'code', 'referenceNumber',
  'description', 'title', 'sku', 'gstNumber', 'panNumber',
];

const MAX_BULK = 500;

function getDeepValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

function toValidDateString(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resolveDateField<T>(SchemaModel: Model<T>, options: HandlerFactoryOptions<T>): string | null {
  if (options.dateField && SchemaModel.schema.path(options.dateField)) {
    return options.dateField;
  }

  const schemaPaths = Object.entries(SchemaModel.schema.paths || {})
    .filter(([, pathDef]) => (pathDef as { instance?: string })?.instance === 'Date')
    .map(([field]) => field);

  const preferred = ['invoiceDate', 'purchaseDate', 'saleDate', 'transactionDate', 'date', 'createdAt'];
  const picked = preferred.find((field) => schemaPaths.includes(field));
  return picked || null;
}

function normalizeQueryForDateRange<T>(
  SchemaModel: Model<T>,
  rawQuery: ApiFeaturesQueryParams = {},
  options: HandlerFactoryOptions<T> = {}
): ApiFeaturesQueryParams {
  const query: ApiFeaturesQueryParams = { ...rawQuery };

  const rawStart = query.startDate ?? query.fromDate ?? query.dateFrom ?? query.start;
  const rawEnd = query.endDate ?? query.toDate ?? query.dateTo ?? query.end;

  const dateField = resolveDateField(SchemaModel, options);
  if (dateField && (rawStart || rawEnd)) {
    const existing = query[dateField];
    const range: Record<string, unknown> =
      typeof existing === 'object' && existing !== null ? { ...(existing as Record<string, unknown>) } : {};

    const startIso = toValidDateString(rawStart);
    const endIso = toValidDateString(rawEnd);

    if (startIso) range.gte = startIso;
    if (endIso) range.lte = endIso;

    if (Object.keys(range).length) {
      query[dateField] = range;
    }
  }

  delete query.startDate;
  delete query.endDate;
  delete query.fromDate;
  delete query.toDate;
  delete query.dateFrom;
  delete query.dateTo;
  delete query.start;
  delete query.end;

  return query;
}

function resolveSearchFields<T>(SchemaModel: Model<T>, options: HandlerFactoryOptions<T>): string[] {
  if (Array.isArray(options.searchFields) && options.searchFields.length) {
    return options.searchFields;
  }
  const schemaPaths = Object.keys(SchemaModel.schema.paths || {});
  const detected = DEFAULT_SEARCH_CANDIDATES.filter((field) => schemaPaths.includes(field));
  return detected.length ? detected : ['name', 'title', 'description'];
}

/**
 * CRUD HANDLER FACTORY
 * Enforces strict multi-tenant isolation across all system models.
 * Direct TypeScript port — logic unchanged from the original JS.
 */

export function getAll<T extends Document>(SchemaModel: Model<T>, options: HandlerFactoryOptions<T> = {}) {
  return catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const filter: Record<string, unknown> = { organizationId: req.user.organizationId };

    if (SchemaModel.schema.path('isDeleted')) filter.isDeleted = { $ne: true };
    if (SchemaModel.schema.path('isActive') && !options.includeInactive) {
      filter.isActive = { $ne: false };
    }

    const normalizedQuery = normalizeQueryForDateRange(SchemaModel, req.query as ApiFeaturesQueryParams, options);

    const features = new ApiFeatures<T>(SchemaModel.find(filter), normalizedQuery)
      .filter()
      .search(resolveSearchFields(SchemaModel, options))
      .sort()
      .limitFields()
      .paginate();

    if (options.populate) {
      features.setQuery(features.getQuery().populate(options.populate) as ReturnType<typeof SchemaModel.find>);
    }

    const result = await features.execute();

    res.status(200).json({
      status: 'success',
      results: result.results,
      pagination: result.pagination,
      data: { data: result.data },
    });
  });
}

export function getOne<T extends Document>(SchemaModel: Model<T>, options: HandlerFactoryOptions<T> = {}) {
  return catchAsync(async (req: AuthenticatedRequest<{ id: string }>, res: Response) => {
    let query = SchemaModel.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (options.populate) query = query.populate(options.populate);
    const doc = await query.lean();

    if (!doc) throw ApiError.notFound('Document not found or unauthorized');

    res.status(200).json({ status: 'success', data: { data: doc } });
  });
}

export function createOne<T extends Document>(SchemaModel: Model<T>) {
  return catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    body.organizationId = req.user.organizationId;
    body.createdBy = req.user._id || req.user.id;

    if (SchemaModel.schema.path('isActive') && body.isActive === undefined) {
      body.isActive = true;
    }

    const doc = await SchemaModel.create(body as Record<string, unknown>);
    res.status(201).json({ status: 'success', data: { data: doc } });
  });
}

export function updateOne<T extends Document>(SchemaModel: Model<T>) {
  return catchAsync(async (req: AuthenticatedRequest<{ id: string }>, res: Response) => {
    const body = req.body as Record<string, unknown>;
    body.updatedBy = req.user._id || req.user.id;
    body.updatedAt = Date.now();

    // 🟢 SECURITY: Remove organizationId from body to prevent tenant-hopping
    delete body.organizationId;

    const doc = await SchemaModel.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      body,
      { new: true, runValidators: true }
    );

    if (!doc) throw ApiError.notFound('Document not found or unauthorized');
    res.status(200).json({ status: 'success', data: { data: doc } });
  });
}

export function deleteOne<T extends Document>(SchemaModel: Model<T>) {
  return catchAsync(async (req: AuthenticatedRequest<{ id: string }>, res: Response) => {
    const filter = { _id: req.params.id, organizationId: req.user.organizationId };
    const hasSoftDelete = !!SchemaModel.schema.path('isDeleted');
    let doc: HydratedDocument<T> | null;

    if (hasSoftDelete) {
      doc = await SchemaModel.findOneAndUpdate(
        filter,
        {
          isDeleted: true,
          isActive: false,
          deletedBy: req.user._id || req.user.id,
          deletedAt: Date.now(),
        },
        { new: true }
      );
    } else {
      doc = await SchemaModel.findOneAndDelete(filter);
    }

    if (!doc) throw ApiError.notFound('Document not found');
    res.status(204).json({ status: 'success', data: null });
  });
}

export function bulkCreate<T extends Document>(SchemaModel: Model<T>) {
  return catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!Array.isArray(req.body)) throw ApiError.badRequest('Request body must be an array');

    if (req.body.length > MAX_BULK) {
      throw ApiError.badRequest(`Maximum ${MAX_BULK} items per bulk import`);
    }

    const docs = (req.body as Record<string, unknown>[]).map((item) => ({
      ...item,
      organizationId: req.user.organizationId,
      createdBy: req.user.id,
      isActive: item.isActive ?? true,
    }));

    const result = await SchemaModel.insertMany(docs);

    res.status(201).json({
      status: 'success',
      results: result.length,
      data: { data: result },
    });
  });
}

export function bulkUpdate<T extends Document>(SchemaModel: Model<T>) {
  return catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { ids, updates } = req.body as { ids?: string[]; updates?: Record<string, unknown> };

    if (ids && ids.length > MAX_BULK) throw ApiError.badRequest('Too many IDs provided');
    if (!Array.isArray(ids) || !updates) throw ApiError.badRequest('IDs and Updates required');

    delete updates.organizationId;
    delete updates.createdBy;

    const result = await SchemaModel.updateMany(
      { _id: { $in: ids }, organizationId: req.user.organizationId },
      {
        $set: {
          ...updates,
          updatedBy: req.user.id,
          updatedAt: Date.now(),
        },
      },
      { runValidators: true }
    );

    res.status(200).json({
      status: 'success',
      data: { matched: result.matchedCount, modified: result.modifiedCount },
    });
  });
}

export function bulkDelete<T extends Document>(SchemaModel: Model<T>) {
  return catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { ids, hardDelete = false } = req.body as { ids?: string[]; hardDelete?: boolean };
    if (!Array.isArray(ids)) throw ApiError.badRequest('IDs array required');

    const filter = { _id: { $in: ids }, organizationId: req.user.organizationId };
    const hasSoftDelete = !!SchemaModel.schema.path('isDeleted');
    let result: { deletedCount?: number; modifiedCount?: number };

    if (!hardDelete && hasSoftDelete) {
      result = await SchemaModel.updateMany(filter, {
        isDeleted: true,
        isActive: false,
        deletedBy: req.user._id || req.user.id,
        deletedAt: Date.now(),
      });
    } else {
      result = await SchemaModel.deleteMany(filter);
    }

    res.status(200).json({
      status: 'success',
      data: { deletedCount: result.deletedCount ?? result.modifiedCount },
    });
  });
}

export function restoreOne<T extends Document>(SchemaModel: Model<T>) {
  return catchAsync(async (req: AuthenticatedRequest<{ id: string }>, res: Response) => {
    if (!SchemaModel.schema.path('isDeleted')) throw ApiError.badRequest('Model does not support restoration');

    const doc = await SchemaModel.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId, isDeleted: true },
      { isDeleted: false, isActive: true, restoredBy: req.user._id || req.user.id, restoredAt: Date.now() },
      { new: true }
    );

    if (!doc) throw ApiError.notFound('No deleted document found');
    res.status(200).json({ status: 'success', data: { data: doc } });
  });
}

export function count<T extends Document>(SchemaModel: Model<T>) {
  return catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const filter: Record<string, unknown> = { organizationId: req.user.organizationId };
    if (SchemaModel.schema.path('isDeleted')) filter.isDeleted = { $ne: true };

    const normalizedQuery = normalizeQueryForDateRange(SchemaModel, req.query as ApiFeaturesQueryParams);
    const features = new ApiFeatures<T>(SchemaModel.find(filter), normalizedQuery).filter();
    const resolvedQuery = features.getQuery() as ReturnType<typeof SchemaModel.find>;
    const total = await SchemaModel.countDocuments(resolvedQuery.getFilter());

    res.status(200).json({ status: 'success', data: { count: total } });
  });
}

export function exportData<T extends Document>(SchemaModel: Model<T>, options: HandlerFactoryOptions<T> = {}) {
  return catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const filter: Record<string, unknown> = { organizationId: req.user.organizationId };
    if (SchemaModel.schema.path('isDeleted')) filter.isDeleted = { $ne: true };

    const normalizedQuery = normalizeQueryForDateRange(SchemaModel, req.query as ApiFeaturesQueryParams, options);

    const features = new ApiFeatures<T>(SchemaModel.find(filter), normalizedQuery)
      .filter()
      .search(resolveSearchFields(SchemaModel, options))
      .sort()
      .limitFields();

    const resolvedQuery = features.getQuery() as ReturnType<typeof SchemaModel.find>;
    const data = await resolvedQuery.lean();
    res.status(200).json({ status: 'success', results: data.length, data: { data } });
  });
}

export function getStats<T extends Document>(SchemaModel: Model<T>) {
  return catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const features = new ApiFeatures<T>(SchemaModel.find(), req.query as ApiFeaturesQueryParams).filter();
    const resolvedQuery = features.getQuery() as ReturnType<typeof SchemaModel.find>;
    const filter = resolvedQuery.getFilter();

    filter.organizationId = req.user.organizationId;
    if (SchemaModel.schema.path('isDeleted')) filter.isDeleted = { $ne: true };

    const stats = await SchemaModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: { stats: stats[0] || { total: 0, active: 0, inactive: 0 } },
    });
  });
}

/**
 * 📊 MASTER EXCEL EXPORT
 * Generates highly stylized, professional Excel reports with multi-tenant filtering.
 */
export function exportExcel<T extends Document>(SchemaModel: Model<T>, options: HandlerFactoryOptions<T> = {}) {
  return catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const filter: Record<string, unknown> = { organizationId: req.user.organizationId };
    if (SchemaModel.schema.path('isDeleted')) filter.isDeleted = { $ne: true };

    const exportLimit = Math.min(Math.abs(parseInt(String(req.query.limit), 10)) || 10000, 20000);

    const normalizedQuery = normalizeQueryForDateRange(SchemaModel, req.query as ApiFeaturesQueryParams, options);

    const features = new ApiFeatures<T>(SchemaModel.find(filter), normalizedQuery)
      .filter()
      .search(resolveSearchFields(SchemaModel, options))
      .sort();

    let resolvedQuery = features.getQuery() as ReturnType<typeof SchemaModel.find>;

    const populationPaths = options.populate || (req.query.populate as string | undefined);
    if (populationPaths) {
      resolvedQuery = resolvedQuery.populate(populationPaths as PopulateOptions | string);
    }

    const docs = await resolvedQuery.limit(exportLimit).lean();

    if (!docs.length) {
      res.status(200).json({
        status: 'success',
        message: 'No matching records found for export',
      });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Apex CRM System';
    workbook.lastModifiedBy = req.user.name || 'System Admin';
    workbook.created = new Date();

    const sheetName = options.sheetName || 'Report';
    const worksheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    let columns: Array<{ header: string; key: string; width?: number }>;

    if (options.exportFields && options.exportFields.length) {
      columns = options.exportFields;
    } else if (req.query.fields) {
      columns = String(req.query.fields)
        .split(',')
        .map((f) => ({
          header: f.trim().replace(/([A-Z])/g, ' $1').toUpperCase(),
          key: f.trim(),
          width: 20,
        }));
    } else {
      columns = Object.keys(docs[0] as Record<string, unknown>)
        .filter((k) => !['_id', '__v', 'organizationId', 'isDeleted'].includes(k))
        .map((k) => ({
          header: k.replace(/([A-Z])/g, ' $1').toUpperCase(),
          key: k,
          width: 20,
        }));
    }

    worksheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 20,
      style: { alignment: { vertical: 'middle' } },
    }));

    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2B3E50' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    docs.forEach((doc, index) => {
      const rowData: Record<string, unknown> = {};
      columns.forEach((col) => {
        let value = getDeepValue(doc as Record<string, unknown>, col.key);

        if (value instanceof Date) {
          value = value.toISOString().split('T')[0];
        }

        if (typeof value === 'boolean') {
          value = value ? '✅ YES' : '❌ NO';
        }

        if (Array.isArray(value)) {
          value = value.join(', ');
        }

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const obj = value as Record<string, unknown>;
          value = obj.name || obj.title || obj.code || JSON.stringify(obj);
        }

        rowData[col.key] = value === undefined || value === null ? '' : value;
      });

      const row = worksheet.addRow(rowData);
      row.height = 20;

      if (index % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' },
        };
      }
    });

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

    const fileName = `${options.fileName || 'export'}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  });
}