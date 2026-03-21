'use strict';

const AppError = require("./appError");
const ApiFeatures = require("./ApiFeatures");
const catchAsync = require("./catchAsync");

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

exports.bulkCreate = (Model) =>
  catchAsync(async (req, res, next) => {
    if (!Array.isArray(req.body)) return next(new AppError("Request body must be an array", 400));

    const docs = req.body.map((item) => ({
      ...item,
      organizationId: req.user.organizationId,
      createdBy: req.user._id || req.user.id,
      isActive: item.isActive !== undefined ? item.isActive : true,
    }));

    const result = await Model.insertMany(docs);
    res.status(201).json({ status: "success", results: result.length, data: { data: result } });
  });

exports.bulkUpdate = (Model) =>
  catchAsync(async (req, res, next) => {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || !updates) return next(new AppError("IDs and Updates required", 400));

    delete updates.organizationId;
    updates.updatedBy = req.user._id || req.user.id;
    updates.updatedAt = Date.now();

    const result = await Model.updateMany(
      { _id: { $in: ids }, organizationId: req.user.organizationId },
      updates,
      { runValidators: true }
    );

    res.status(200).json({ status: "success", data: { matched: result.matchedCount, modified: result.modifiedCount } });
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
