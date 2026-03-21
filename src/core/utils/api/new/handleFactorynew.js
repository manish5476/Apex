// controllers/handlerFactory.js - ENTERPRISE CRUD FACTORY
const ApiFeatures = require("../ApiFeatures");
const AppError = require("../appError");
// ValidationError and AuthorizationError are just AppError with specific status codes
const ValidationError = AppError;
const AuthorizationError = AppError;
const catchAsync = require("../catchAsync");
const auditLogger = require("../../auditLogger");
const rateLimiter = require("../../../middleware/rateLimit.middleware");
// Note: validator may not exist, handle gracefully if needed
let validator;
try {
  validator = require("../validator");
} catch (e) {
  validator = null; // Optional dependency
}

/**
 * ENTERPRISE CRUD HANDLER FACTORY
 * With: Hooks, Middleware, Validation, Rate Limiting, Audit Logging
 */
class CrudHandlerFactory {
  constructor(Model, options = {}) {
    this.Model = Model;
    this.options = {
      // Security
      requireAuth: options.requireAuth !== false,
      checkOwnership: options.checkOwnership || false,
      allowedRoles: options.allowedRoles || [],
      fieldPermissions: options.fieldPermissions || {},

      // Features
      enableSoftDelete: Model.schema?.paths?.isDeleted ? true : false,
      enableAuditLog: options.enableAuditLog !== false,
      enableValidation: options.enableValidation !== false,
      enableRateLimit: options.enableRateLimit || false,

      // Defaults
      defaultSort: options.defaultSort || "-createdAt",
      defaultLimit: options.defaultLimit || 50,
      maxLimit: options.maxLimit || 1000,
      searchFields: options.searchFields || ["name", "title", "description"],
      population: options.population || {},

      // Hooks
      preHooks: options.preHooks || {},
      postHooks: options.postHooks || {},
      transformHooks: options.transformHooks || {},

      ...options,
    };
  }

  /**
   * APPLY HOOKS
   */
  async _applyHook(type, stage, req, res, data = null) {
    const hookKey = `${type}Hooks`;
    const hook = this.options[hookKey]?.[stage];

    if (hook) {
      if (typeof hook === "function") {
        return await hook(req, res, data);
      }
    }
    return data;
  }

  /**
   * BUILD SECURITY CONTEXT
   */
  _buildSecurityContext(req) {
    return {
      userId: req.user?.id,
      organizationId: req.user?.organizationId,
      roles: req.user?.roles || [],
      permissions: req.user?.permissions || [],
    };
  }

  /**
   * BUILD BASE FILTER
   */
  _buildBaseFilter(req) {
    const filter = {};

    // Organization isolation
    if (this.Model.schema?.paths?.organizationId && req.user?.organizationId) {
      filter.organizationId = req.user.organizationId;
    }

    // Soft delete
    if (this.options.enableSoftDelete && !req.query.includeDeleted) {
      filter.isDeleted = { $ne: true };
    }

    // Active records
    if (this.Model.schema?.paths?.isActive && !req.query.includeInactive) {
      filter.isActive = { $ne: false };
    }

    return filter;
  }

  /**
   * VALIDATE PERMISSIONS
   */
  _validatePermissions(req, action, data = null) {
    // Role-based access control
    if (this.options.allowedRoles.length > 0) {
      const hasRole = req.user?.roles?.some((role) =>
        this.options.allowedRoles.includes(role),
      );
      if (!hasRole) {
        throw new AuthorizationError(`Insufficient permissions for ${action}`, {
          requiredRoles: this.options.allowedRoles,
        });
      }
    }

    // Field-level permissions
    if (this.options.fieldPermissions[action]) {
      const allowedFields = this.options.fieldPermissions[action];
      const requestedFields = Object.keys(req.body || {});
      const forbiddenFields = requestedFields.filter(
        (f) => !allowedFields.includes(f),
      );

      if (forbiddenFields.length > 0) {
        throw new AuthorizationError(
          `Cannot modify fields: ${forbiddenFields.join(", ")}`,
          { allowedFields },
        );
      }
    }
  }

  /**
   * AUDIT LOG
   */
  async _logAudit(req, action, data = null, changes = null) {
    if (!this.options.enableAuditLog) return;

    await auditLogger.log({
      timestamp: new Date(),
      userId: req.user?.id,
      organizationId: req.user?.organizationId,
      action,
      resource: this.Model.modelName,
      resourceId: data?._id || req.params.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      changes,
      metadata: {
        url: req.originalUrl,
        method: req.method,
        params: req.params,
        query: req.query,
      },
    });
  }

  /**
   * GET ALL DOCUMENTS (ADVANCED)
   */
  getAll(options = {}) {
    return catchAsync(async (req, res, next) => {
      // Rate limiting
      if (this.options.enableRateLimit) {
        await rateLimiter.check(req, "read");
      }

      // Pre-hook
      await this._applyHook("pre", "getAll", req, res);

      // Build query
      const securityContext = this._buildSecurityContext(req);
      const baseFilter = this._buildBaseFilter(req);

      const apiFeatures = new ApiFeatures(
        this.Model.find(baseFilter),
        req.query,
        {
          model: this.Model,
          user: req.user,
          baseFilter,
          securityContext,
          requestId: req.requestId,
          config: {
            maxLimit: this.options.maxLimit,
            defaultLimit: this.options.defaultLimit,
            allowedSortFields: options.allowedSortFields,
          },
        },
      );

      // Apply features
      apiFeatures
        .filter(options.filterOptions)
        .search({
          fields: options.searchFields || this.options.searchFields,
          strategies: options.searchStrategies || ["text", "regex"],
        })
        .sort(options.sort || this.options.defaultSort)
        .select(options.allowedFields)
        .paginate(options.paginationStrategy || "offset")
        .populate(options.population || this.options.population);

      // Execute
      const result = await apiFeatures.execute({
        useCache: options.useCache !== false,
        lean: options.lean !== false,
        transform: options.transform,
      });

      // Post-hook
      const transformedResult = await this._applyHook(
        "post",
        "getAll",
        req,
        res,
        result,
      );

      // Audit log
      await this._logAudit(req, "READ_MANY", null, {
        filter: baseFilter,
        count: transformedResult.data.length,
      });

      // Response
      res.status(200).json({
        status: "success",
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        ...transformedResult,
      });
    });
  }

  /**
   * GET ONE DOCUMENT (WITH PERMISSIONS)
   */
  getOne(options = {}) {
    return catchAsync(async (req, res, next) => {
      // Pre-hook
      await this._applyHook("pre", "getOne", req, res);

      // Build query
      const conditions = { _id: req.params.id, ...this._buildBaseFilter(req) };

      let query = this.Model.findOne(conditions);

      // Apply population
      if (options.populate || this.options.population) {
        const population = options.populate || this.options.population;
        Object.entries(population).forEach(([path, config]) => {
          query = query.populate({
            path,
            ...(typeof config === "object" ? config : {}),
          });
        });
      }

      // Execute
      const doc = await query;

      if (!doc) {
        throw new AppError(`${this.Model.modelName} not found`, 404);
      }

      // Ownership check
      if (this.options.checkOwnership) {
        const isOwner = doc.createdBy?.toString() === req.user?.id;
        const isAdmin = req.user?.roles?.includes("admin");
        if (!isOwner && !isAdmin) {
          throw new AuthorizationError(
            "Not authorized to access this resource",
          );
        }
      }

      // Post-hook
      const transformedDoc = await this._applyHook(
        "post",
        "getOne",
        req,
        res,
        doc,
      );

      // Audit log
      await this._logAudit(req, "READ_ONE", transformedDoc);

      // Response
      res.status(200).json({
        status: "success",
        requestId: req.requestId,
        data: {
          data: transformedDoc,
        },
      });
    });
  }

  /**
   * CREATE DOCUMENT (WITH VALIDATION)
   */
  createOne(options = {}) {
    return catchAsync(async (req, res, next) => {
      // Validate permissions
      this._validatePermissions(req, "create");

      // Pre-hook
      await this._applyHook("pre", "createOne", req, res);

      // Validation
      if (this.options.enableValidation) {
        const validationErrors = await validator.validate(
          this.Model,
          req.body,
          "create",
        );
        if (validationErrors.length > 0) {
          throw new ValidationError("Validation failed", {
            errors: validationErrors,
          });
        }
      }

      // Prepare data
      const data = { ...req.body };

      // Auto-assign metadata
      if (req.user) {
        data.createdBy = req.user.id;
        data.updatedBy = req.user.id;
        if (this.Model.schema.paths.organizationId && req.user.organizationId) {
          data.organizationId = req.user.organizationId;
        }
      }

      // Default values
      if (this.options.enableSoftDelete && data.isDeleted === undefined) {
        data.isDeleted = false;
      }
      if (this.Model.schema.paths.isActive && data.isActive === undefined) {
        data.isActive = true;
      }

      // Transform before save
      const transformedData = await this._applyHook(
        "transform",
        "beforeCreate",
        req,
        res,
        data,
      );

      // Create document
      const doc = await this.Model.create(transformedData);

      // Post-create hook
      const finalDoc = await this._applyHook(
        "post",
        "createOne",
        req,
        res,
        doc,
      );

      // Populate if needed
      if (options.populate) {
        await finalDoc.populate(options.populate);
      }

      // Audit log
      await this._logAudit(req, "CREATE", finalDoc, {
        from: null,
        to: finalDoc.toObject(),
      });

      // Response
      res.status(201).json({
        status: "success",
        requestId: req.requestId,
        data: {
          data: finalDoc,
        },
      });
    });
  }

  /**
   * UPDATE DOCUMENT (WITH OPTIMISTIC LOCKING)
   */
  updateOne(options = {}) {
    return catchAsync(async (req, res, next) => {
      // Validate permissions
      this._validatePermissions(req, "update", req.body);

      // Pre-hook
      await this._applyHook("pre", "updateOne", req, res);

      // Build conditions
      const conditions = { _id: req.params.id, ...this._buildBaseFilter(req) };

      // Fetch current document (for audit and optimistic locking)
      const currentDoc = await this.Model.findOne(conditions);
      if (!currentDoc) {
        throw new AppError(`${this.Model.modelName} not found`, 404);
      }

      // Check version for optimistic locking
      if (options.enableOptimisticLocking && req.body.__v !== undefined) {
        if (currentDoc.__v !== req.body.__v) {
          throw new AppError("Document has been modified since last read", 409);
        }
      }

      // Prepare update data
      const updateData = { ...req.body };

      // Add audit info
      if (req.user) {
        updateData.updatedBy = req.user.id;
        updateData.updatedAt = Date.now();
      }

      // Transform before update
      const transformedData = await this._applyHook(
        "transform",
        "beforeUpdate",
        req,
        res,
        {
          current: currentDoc.toObject(),
          update: updateData,
        },
      );

      // Perform update
      const updatedDoc = await this.Model.findOneAndUpdate(
        conditions,
        transformedData.update,
        {
          new: true,
          runValidators: this.options.enableValidation,
          context: "query",
          ...options.queryOptions,
        },
      ).populate(options.populate);

      // Post-hook
      const finalDoc = await this._applyHook(
        "post",
        "updateOne",
        req,
        res,
        updatedDoc,
      );

      // Audit log
      await this._logAudit(req, "UPDATE", finalDoc, {
        from: currentDoc.toObject(),
        to: finalDoc.toObject(),
        changes: transformedData.update,
      });

      // Response
      res.status(200).json({
        status: "success",
        requestId: req.requestId,
        data: {
          data: finalDoc,
        },
      });
    });
  }

  /**
   * DELETE DOCUMENT (SOFT/HARD WITH CASCADE)
   */
  deleteOne(options = {}) {
    return catchAsync(async (req, res, next) => {
      // Validate permissions
      this._validatePermissions(req, "delete");

      // Pre-hook
      await this._applyHook("pre", "deleteOne", req, res);

      // Build conditions
      const conditions = { _id: req.params.id, ...this._buildBaseFilter(req) };

      // Check for cascade delete
      if (options.cascade) {
        await this._handleCascadeDelete(req.params.id, req.user);
      }

      let deletedDoc;

      // Soft delete if enabled
      if (this.options.enableSoftDelete && !options.hardDelete) {
        deletedDoc = await this.Model.findOneAndUpdate(
          conditions,
          {
            isDeleted: true,
            isActive: false,
            deletedBy: req.user?.id,
            deletedAt: Date.now(),
            ...options.softDeleteFields,
          },
          { new: true },
        );
      } else {
        // Hard delete
        deletedDoc = await this.Model.findOneAndDelete(conditions);
      }

      if (!deletedDoc) {
        throw new AppError(`${this.Model.modelName} not found`, 404);
      }

      // Post-hook
      await this._applyHook("post", "deleteOne", req, res, deletedDoc);

      // Audit log
      await this._logAudit(req, "DELETE", deletedDoc);

      // Response
      res.status(204).json({
        status: "success",
        requestId: req.requestId,
        data: null,
      });
    });
  }

  /**
   * BATCH OPERATIONS
   */
  batchCreate() {
    return catchAsync(async (req, res, next) => {
      if (!Array.isArray(req.body)) {
        throw new ValidationError("Request body must be an array");
      }

      // Validate each item
      if (this.options.enableValidation) {
        for (const item of req.body) {
          const errors = await validator.validate(this.Model, item, "create");
          if (errors.length > 0) {
            throw new ValidationError("Batch validation failed", { errors });
          }
        }
      }

      // Prepare batch
      const batch = req.body.map((item) => ({
        ...item,
        createdBy: req.user?.id,
        organizationId: req.user?.organizationId,
        isActive: item.isActive !== undefined ? item.isActive : true,
      }));

      // Insert batch
      const docs = await this.Model.insertMany(batch, { ordered: false });

      // Audit log
      await this._logAudit(req, "BATCH_CREATE", null, {
        count: docs.length,
        ids: docs.map((d) => d._id),
      });

      res.status(201).json({
        status: "success",
        results: docs.length,
        data: {
          data: docs,
        },
      });
    });
  }

  /**
   * GENERATE OPENAPI/SCHEMA
   */
  generateOpenApiSchema() {
    const schema = {
      paths: {},
      components: {
        schemas: {
          [`${this.Model.modelName}Response`]: {
            type: "object",
            properties: {
              status: { type: "string", example: "success" },
              data: {
                type: "object",
                properties: {
                  data: {
                    $ref: `#/components/schemas/${this.Model.modelName}`,
                  },
                },
              },
            },
          },
        },
      },
    };

    // Add paths based on available handlers
    return schema;
  }

  /**
   * GET METRICS
   */
  async getMetrics(req, res) {
    const metrics = {
      model: this.Model.modelName,
      totalDocuments: await this.Model.countDocuments(),
      activeDocuments: await this.Model.countDocuments({ isActive: true }),
      deletedDocuments: await this.Model.countDocuments({ isDeleted: true }),
      last24h: await this.Model.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    };

    res.json({
      status: "success",
      data: { metrics },
    });
  }
}

/**
 * FACTORY EXPORTS (LEGACY SUPPORT + NEW)
 */
const createHandlerFactory = (Model, options) =>
  new CrudHandlerFactory(Model, options);

// Legacy exports (backward compatibility)
exports.getAll = (Model, options) =>
  createHandlerFactory(Model, options).getAll(options);

exports.getOne = (Model, options) =>
  createHandlerFactory(Model, options).getOne(options);

exports.createOne = (Model, options) =>
  createHandlerFactory(Model, options).createOne(options);

exports.updateOne = (Model, options) =>
  createHandlerFactory(Model, options).updateOne(options);

exports.deleteOne = (Model, options) =>
  createHandlerFactory(Model, options).deleteOne(options);

// New pattern
exports.CrudHandlerFactory = CrudHandlerFactory;
exports.createHandlerFactory = createHandlerFactory;

// Additional utilities
exports.restoreOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findOneAndUpdate(
      {
        _id: req.params.id,
        organizationId: req.user.organizationId,
        isDeleted: true,
      },
      {
        isDeleted: false,
        isActive: true,
        restoredBy: req.user.id,
        restoredAt: Date.now(),
      },
      { new: true },
    );

    if (!doc) {
      throw new AppError("No soft-deleted document found", 404);
    }

    res.status(200).json({
      status: "success",
      data: { data: doc },
    });
  });

exports.getStats = (Model, match = {}) =>
  catchAsync(async (req, res, next) => {
    const baseMatch = { organizationId: req.user.organizationId, ...match };

    if (Model.schema.path("isDeleted")) {
      baseMatch.isDeleted = { $ne: true };
    }

    const stats = await Model.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 } } }],
          byStatus: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                lastUpdated: { $max: "$updatedAt" },
              },
            },
          ],
          timeline: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            { $limit: 30 },
          ],
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      data: { stats: stats[0] },
    });
  });
