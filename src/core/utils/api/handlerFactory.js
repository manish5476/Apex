'use strict';

const ExcelJS = require("exceljs");
const AppError = require("./appError");
const ApiFeatures = require("./ApiFeatures");
const catchAsync = require("./catchAsync");

/**
 * Utility to resolve deep object paths (e.g., "customerId.name")
 */
const getDeepValue = (obj, path) => {
  return path.split(".").reduce((acc, part) => acc && acc[part], obj);
};

/**
 * CRUD HANDLER FACTORY
 * Enforces strict multi-tenant isolation across all system models.
 */

exports.getAll = (Model, options = {}) =>
  catchAsync(async (req, res, next) => {
    // 1. Mandatory Organization Filter
    const filter = { organizationId: req.user.organizationId };

    // 2. Automated status management
    if (Model.schema.path("isDeleted")) filter.isDeleted = { $ne: true };
    if (Model.schema.path("isActive") && !options.includeInactive) {
      filter.isActive = { $ne: false };
    }

    // 3. Build Features
    const features = new ApiFeatures(Model.find(filter), req.query)
      .filter()
      .search(options.searchFields || ["name", "title", "description"])
      .sort()
      .limitFields()
      .paginate();

    if (options.populate) {
      features.query = features.query.populate(options.populate);
    }

    const result = await features.execute();

    res.status(200).json({
      status: "success",
      results: result.results,
      pagination: result.pagination,
      data: { data: result.data },
    });
  });

exports.getOne = (Model, options = {}) =>
  catchAsync(async (req, res, next) => {
    let query = Model.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (options.populate) query = query.populate(options.populate);
    const doc = await query.lean();

    if (!doc) return next(new AppError("Document not found or unauthorized", 404));

    res.status(200).json({ status: "success", data: { data: doc } });
  });

exports.createOne = (Model) =>
  catchAsync(async (req, res, next) => {
    // Zero-Trust: Force organization and creator IDs
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user._id || req.user.id;

    if (Model.schema.path("isActive") && req.body.isActive === undefined) {
      req.body.isActive = true;
    }

    const doc = await Model.create(req.body);
    res.status(201).json({ status: "success", data: { data: doc } });
  });

exports.updateOne = (Model) =>
  catchAsync(async (req, res, next) => {
    // Audit Info
    req.body.updatedBy = req.user._id || req.user.id;
    req.body.updatedAt = Date.now();

    // 🟢 SECURITY: Remove organizationId from body to prevent tenant-hopping
    delete req.body.organizationId;

    const doc = await Model.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!doc) return next(new AppError("Document not found or unauthorized", 404));
    res.status(200).json({ status: "success", data: { data: doc } });
  });

exports.deleteOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const filter = { _id: req.params.id, organizationId: req.user.organizationId };
    const hasSoftDelete = !!Model.schema.path("isDeleted");
    let doc;

    if (hasSoftDelete) {
      doc = await Model.findOneAndUpdate(filter, {
        isDeleted: true,
        isActive: false,
        deletedBy: req.user._id || req.user.id,
        deletedAt: Date.now(),
      }, { new: true });
    } else {
      doc = await Model.findOneAndDelete(filter);
    }

    if (!doc) return next(new AppError("Document not found", 404));
    res.status(204).json({ status: "success", data: null });
  });


  const MAX_BULK = 500;

exports.bulkCreate = (Model) =>
  catchAsync(async (req, res, next) => {
    if (!Array.isArray(req.body)) return next(new AppError("Request body must be an array", 400));
    
    // 1. Enforce the limit
    if (req.body.length > MAX_BULK) {
      return next(new AppError(`Maximum ${MAX_BULK} items per bulk import`, 400));
    }

    const docs = req.body.map((item) => ({
      ...item,
      organizationId: req.user.organizationId,
      createdBy: req.user.id,
      // Logic for isActive remains the same
      isActive: item.isActive ?? true, 
    }));

    const result = await Model.insertMany(docs);
    
    res.status(201).json({ 
      status: "success", 
      results: result.length, 
      data: { data: result } 
    });
  });

exports.bulkUpdate = (Model) =>
  catchAsync(async (req, res, next) => {
    const { ids, updates } = req.body;
    
    // Check for bulk limit on IDs
    if (ids?.length > MAX_BULK) return next(new AppError("Too many IDs provided", 400));
    if (!Array.isArray(ids) || !updates) return next(new AppError("IDs and Updates required", 400));

    // Prevent bypassing multi-tenancy
    delete updates.organizationId;
    delete updates.createdBy;

    const result = await Model.updateMany(
      { _id: { $in: ids }, organizationId: req.user.organizationId },
      { 
        $set: { 
          ...updates, 
          updatedBy: req.user.id,
          updatedAt: Date.now() 
        } 
      },
      { runValidators: true }
    );

    res.status(200).json({ 
      status: "success", 
      data: { matched: result.matchedCount, modified: result.modifiedCount } 
    });
  });


exports.bulkDelete = (Model) =>
  catchAsync(async (req, res, next) => {
    const { ids, hardDelete = false } = req.body;
    if (!Array.isArray(ids)) return next(new AppError("IDs array required", 400));

    const filter = { _id: { $in: ids }, organizationId: req.user.organizationId };
    const hasSoftDelete = !!Model.schema.path("isDeleted");
    let result;

    if (!hardDelete && hasSoftDelete) {
      result = await Model.updateMany(filter, {
        isDeleted: true,
        isActive: false,
        deletedBy: req.user._id || req.user.id,
        deletedAt: Date.now()
      });
    } else {
      result = await Model.deleteMany(filter);
    }

    res.status(200).json({ status: "success", data: { deletedCount: result.deletedCount || result.modifiedCount } });
  });

exports.restoreOne = (Model) =>
  catchAsync(async (req, res, next) => {
    if (!Model.schema.path("isDeleted")) return next(new AppError("Model does not support restoration", 400));

    const doc = await Model.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId, isDeleted: true },
      { isDeleted: false, isActive: true, restoredBy: req.user._id || req.user.id, restoredAt: Date.now() },
      { new: true }
    );

    if (!doc) return next(new AppError("No deleted document found", 404));
    res.status(200).json({ status: "success", data: { data: doc } });
  });

exports.count = (Model) =>
  catchAsync(async (req, res, next) => {
    const filter = { organizationId: req.user.organizationId };
    if (Model.schema.path("isDeleted")) filter.isDeleted = { $ne: true };

    const features = new ApiFeatures(Model.find(filter), req.query).filter();
    const count = await Model.countDocuments(features.query.getFilter());

    res.status(200).json({ status: "success", data: { count } });
  });

exports.exportData = (Model, options = {}) =>
  catchAsync(async (req, res, next) => {
    const filter = { organizationId: req.user.organizationId };
    if (Model.schema.path("isDeleted")) filter.isDeleted = { $ne: true };

    const features = new ApiFeatures(Model.find(filter), req.query)
      .filter()
      .search(options.searchFields || ["name", "title"])
      .sort()
      .limitFields();

    const data = await features.query.lean();
    res.status(200).json({ status: "success", results: data.length, data: { data } });
  });

exports.getStats = (Model) =>
  catchAsync(async (req, res, next) => {
    const features = new ApiFeatures(Model.find(), req.query).filter();
    const filter = features.query.getFilter();

    // Enforce isolation
    filter.organizationId = req.user.organizationId;
    if (Model.schema.path("isDeleted")) filter.isDeleted = { $ne: true };

    const stats = await Model.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] } }
        }
      }
    ]);

    res.status(200).json({
      status: "success",
      data: { stats: stats[0] || { total: 0, active: 0, inactive: 0 } }
    });
  });

/**
 * 📊 MASTER EXCEL EXPORT
 * Generates highly stylized, professional Excel reports with multi-tenant filtering.
 */
exports.exportExcel = (Model, options = {}) =>
  catchAsync(async (req, res, next) => {
    // 1. Base Filter (Strict Isolation)
    const filter = { organizationId: req.user.organizationId };
    if (Model.schema.path("isDeleted")) filter.isDeleted = { $ne: true };

    // 2. Build Query using ApiFeatures (reuse UI filters/search)
    // We EXCLUDE standard pagination but apply a safety limit
    const exportLimit = Math.min(Math.abs(parseInt(req.query.limit, 10)) || 10000, 20000);

    const features = new ApiFeatures(Model.find(filter), req.query)
      .filter()
      .search(options.searchFields || ["name", "description", "referenceNumber"])
      .sort();

    // Population
    const populationPaths = options.populate || req.query.populate;
    if (populationPaths) {
      features.query = features.query.populate(populationPaths);
    }

    // Apply safety limit and execute
    const docs = await features.query.limit(exportLimit).lean();

    if (!docs.length) {
      return res.status(200).json({
        status: "success",
        message: "No matching records found for export"
      });
    }

    // 3. Create Workbook & Worksheet
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Apex CRM System";
    workbook.lastModifiedBy = req.user.name || "System Admin";
    workbook.created = new Date();

    const sheetName = options.sheetName || "Report";
    const worksheet = workbook.addWorksheet(sheetName, {
      views: [{ state: "frozen", ySplit: 1 }] // Frozen header
    });

    // 4. Resolve Columns
    // Priority: req.query.fields > options.exportFields > Model Schema Keys
    let columns = [];

    if (options.exportFields && options.exportFields.length) {
      columns = options.exportFields;
    } else if (req.query.fields) {
      columns = req.query.fields.split(",").map(f => ({
        header: f.trim().replace(/([A-Z])/g, " $1").toUpperCase(),
        key: f.trim(),
        width: 20
      }));
    } else {
      // Derive from the first object
      columns = Object.keys(docs[0])
        .filter(k => !["_id", "__v", "organizationId", "isDeleted"].includes(k))
        .map(k => ({
          header: k.replace(/([A-Z])/g, " $1").toUpperCase(),
          key: k,
          width: 20
        }));
    }

    worksheet.columns = columns.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width || 20,
      style: { alignment: { vertical: "middle" } }
    }));

    // 5. Apply "Beautiful" Styling to Header
    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2B3E50" } // Dark Professional Blue
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    // 6. Populate Rows & Apply Data-Aware Styling
    docs.forEach((doc, index) => {
      const rowData = {};
      columns.forEach(col => {
        let value = getDeepValue(doc, col.key);

        // Date Handling
        if (value instanceof Date) {
          value = value.toISOString().split("T")[0];
        }

        // Boolean handling (Beauty touch)
        if (typeof value === "boolean") {
          value = value ? "✅ YES" : "❌ NO";
        }

        // Array Handling
        if (Array.isArray(value)) {
          value = value.join(", ");
        }

        // Object fallback (unpopulated)
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          value = value.name || value.title || value.code || JSON.stringify(value);
        }

        rowData[col.key] = value === undefined || value === null ? "" : value;
      });

      const row = worksheet.addRow(rowData);
      row.height = 20;

      // 7. Zebra Striping for Readability
      if (index % 2 === 0) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF9FAFB" } // Very light gray
        };
      }
    });

    // 8. Auto-filter & Finalization
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length }
    };

    // 9. Send Buffer
    const fileName = `${options.fileName || "export"}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  });
