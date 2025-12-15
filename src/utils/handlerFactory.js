const AppError = require('../utils/appError');
const ApiFeatures = require('../utils/ApiFeatures');
const catchAsync = require('../utils/catchAsync');

/**
 * ===========================================================
 * CRUD HANDLER FACTORY
 * Universal handlers for all models with organization isolation
 * ===========================================================
 */

/**
 * GET ALL DOCUMENTS
 * Supports: Filtering, Sorting, Pagination, Field Limiting, Search
 */
exports.getAll = (Model, options = {}) =>
  catchAsync(async (req, res, next) => {
    // 1. Base filter: only documents for this organization
    const filter = {
      organizationId: req.user.organizationId,
    };

    // 2. Exclude soft-deleted docs if applicable
    if (Model.schema.path('isDeleted')) {
      filter.isDeleted = { $ne: true };
    }

    // 3. Exclude inactive docs if applicable
    if (Model.schema.path('isActive')) {
      filter.isActive = { $ne: false };
    }

    // 4. Build query using ApiFeatures utility
    const features = new ApiFeatures(Model.find(filter), req.query)
      .filter()
      .search(options.searchFields || ['name', 'title', 'description'])
      .sort()
      .limitFields()
      .paginate();

    // 5. Apply custom populate if provided
    if (options.populate) {
      features.query = features.query.populate(options.populate);
    }

    // 6. Execute query and get pagination metadata
    const result = await features.execute();

    // 7. Send response
    res.status(200).json({
      status: 'success',
      results: result.results,
      pagination: result.pagination,
      data: {
        data: result.data,
      },
    });
  });

/**
 * GET ONE DOCUMENT
 * Optionally populate references
 */
exports.getOne = (Model, options = {}) =>
  catchAsync(async (req, res, next) => {
    // 1. Build base query
    let query = Model.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    // 2. Apply populate if provided
    if (options.populate) {
      query = query.populate(options.populate);
    }

    // 3. Execute query
    const doc = await query;

    // 4. Check if document exists
    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    // 5. Send response
    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

/**
 * CREATE ONE DOCUMENT
 * Automatically assigns organization and creator
 */
exports.createOne = (Model) =>
  catchAsync(async (req, res, next) => {
    // 1. Auto-assign organization and creator
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user.id;

    // 2. Set default status if applicable
    if (Model.schema.path('isActive') && req.body.isActive === undefined) {
      req.body.isActive = true;
    }

    // 3. Create document
    const doc = await Model.create(req.body);

    // 4. Send response
    res.status(201).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

/**
 * UPDATE ONE DOCUMENT
 * Includes audit field and validation
 */
exports.updateOne = (Model) =>
  catchAsync(async (req, res, next) => {
    // 1. Add audit info
    if (req.user) {
      req.body.updatedBy = req.user.id;
      req.body.updatedAt = Date.now();
    }

    // 2. Build query conditions
    const conditions = {
      _id: req.params.id,
      organizationId: req.user.organizationId,
    };

    // 3. Find and update
    const doc = await Model.findOneAndUpdate(conditions, req.body, {
      new: true,
      runValidators: true,
      context: 'query',
    });

    // 4. Check if document exists
    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    // 5. Send response
    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

/**
 * DELETE ONE DOCUMENT
 * Soft delete preferred, hard delete as fallback
 */
exports.deleteOne = (Model) =>
  catchAsync(async (req, res, next) => {
    // 1. Check if model supports soft delete
    const hasSoftDelete = !!Model.schema.path('isDeleted');
    
    // 2. Build query conditions
    const conditions = {
      _id: req.params.id,
      organizationId: req.user.organizationId,
    };

    let doc;

    // 3. Perform soft delete if supported
    if (hasSoftDelete) {
      doc = await Model.findOneAndUpdate(
        conditions,
        {
          isDeleted: true,
          isActive: false,
          deletedBy: req.user.id,
          deletedAt: Date.now(),
        },
        { new: true }
      );
    } 
    // 4. Perform hard delete
    else {
      doc = await Model.findOneAndDelete(conditions);
    }

    // 5. Check if document exists
    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    // 6. Send response
    res.status(204).json({
      status: 'success',
      data: null,
    });
  });

/**
 * BULK CREATE DOCUMENTS
 * Create multiple documents at once
 */
exports.bulkCreate = (Model) =>
  catchAsync(async (req, res, next) => {
    // Validate that req.body is an array
    if (!Array.isArray(req.body)) {
      return next(new AppError('Request body must be an array', 400));
    }

    // Add organization and creator info to each document
    const documents = req.body.map(item => ({
      ...item,
      organizationId: req.user.organizationId,
      createdBy: req.user.id,
      isActive: item.isActive !== undefined ? item.isActive : true,
    }));

    // Insert all documents
    const docs = await Model.insertMany(documents);

    // Send response
    res.status(201).json({
      status: 'success',
      results: docs.length,
      data: {
        data: docs,
      },
    });
  });

/**
 * BULK UPDATE DOCUMENTS
 * Update multiple documents by IDs
 */
exports.bulkUpdate = (Model) =>
  catchAsync(async (req, res, next) => {
    const { ids, updates } = req.body;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return next(new AppError('IDs array is required', 400));
    }

    if (!updates || typeof updates !== 'object') {
      return next(new AppError('Updates object is required', 400));
    }

    // Add audit info
    updates.updatedBy = req.user.id;
    updates.updatedAt = Date.now();

    // Update documents
    const result = await Model.updateMany(
      {
        _id: { $in: ids },
        organizationId: req.user.organizationId,
      },
      updates,
      { runValidators: true }
    );

    // Send response
    res.status(200).json({
      status: 'success',
      data: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
    });
  });

/**
 * BULK DELETE DOCUMENTS
 * Soft or hard delete multiple documents
 */
exports.bulkDelete = (Model) =>
  catchAsync(async (req, res, next) => {
    const { ids, hardDelete = false } = req.body;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return next(new AppError('IDs array is required', 400));
    }

    const hasSoftDelete = !!Model.schema.path('isDeleted');
    let result;

    // Build query conditions
    const conditions = {
      _id: { $in: ids },
      organizationId: req.user.organizationId,
    };

    // Perform bulk delete based on type
    if (hardDelete && !hasSoftDelete) {
      // Hard delete
      result = await Model.deleteMany(conditions);
    } else if (hasSoftDelete) {
      // Soft delete
      result = await Model.updateMany(
        conditions,
        {
          isDeleted: true,
          isActive: false,
          deletedBy: req.user.id,
          deletedAt: Date.now(),
        }
      );
    } else {
      // Hard delete for non-soft-delete models
      result = await Model.deleteMany(conditions);
    }

    // Send response
    res.status(200).json({
      status: 'success',
      data: {
        deletedCount: result.deletedCount || result.modifiedCount,
      },
    });
  });

/**
 * RESTORE ONE DOCUMENT
 * For soft-deleted records only
 */
exports.restoreOne = (Model) =>
  catchAsync(async (req, res, next) => {
    // Check if model supports soft delete
    if (!Model.schema.path('isDeleted')) {
      return next(new AppError('This model does not support restoration', 400));
    }

    // Build query conditions
    const conditions = {
      _id: req.params.id,
      organizationId: req.user.organizationId,
      isDeleted: true,
    };

    // Restore document
    const doc = await Model.findOneAndUpdate(
      conditions,
      {
        isDeleted: false,
        isActive: true,
        restoredBy: req.user.id,
        restoredAt: Date.now(),
      },
      { new: true }
    );

    // Check if document exists
    if (!doc) {
      return next(new AppError('No soft-deleted document found with that ID', 404));
    }

    // Send response
    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

/**
 * COUNT DOCUMENTS
 * Get count with optional filters
 */
exports.count = (Model) =>
  catchAsync(async (req, res, next) => {
    // Build base filter
    const filter = {
      organizationId: req.user.organizationId,
    };

    // Exclude soft-deleted
    if (Model.schema.path('isDeleted')) {
      filter.isDeleted = { $ne: true };
    }

    // Apply additional filters from query
    const features = new ApiFeatures(Model.find(filter), req.query).filter();
    const countFilter = features.query.getFilter();

    // Get count
    const count = await Model.countDocuments(countFilter);

    // Send response
    res.status(200).json({
      status: 'success',
      data: {
        count,
      },
    });
  });

/**
 * EXPORT DATA
 * Get data for export (CSV, Excel, etc.)
 */
exports.exportData = (Model, options = {}) =>
  catchAsync(async (req, res, next) => {
    // Build base filter
    const filter = {
      organizationId: req.user.organizationId,
    };

    // Exclude soft-deleted
    if (Model.schema.path('isDeleted')) {
      filter.isDeleted = { $ne: true };
    }

    // Build query with all filters but no pagination
    const features = new ApiFeatures(Model.find(filter), req.query)
      .filter()
      .search(options.searchFields || ['name', 'title', 'description'])
      .sort()
      .limitFields();

    // Apply custom populate if provided
    if (options.populate) {
      features.query = features.query.populate(options.populate);
    }

    // Get all data (no pagination for export)
    const data = await features.query;

    // Send response
    res.status(200).json({
      status: 'success',
      results: data.length,
      data: {
        data,
      },
    });
  });

/**
 * GET STATISTICS
 * Get aggregated statistics for dashboard
 */
exports.getStats = (Model) =>
  catchAsync(async (req, res, next) => {
    const matchStage = {
      organizationId: req.user.organizationId,
    };

    // Exclude soft-deleted
    if (Model.schema.path('isDeleted')) {
      matchStage.isDeleted = { $ne: true };
    }

    // Apply additional filters
    const features = new ApiFeatures(Model.find(matchStage), req.query).filter();
    const filter = features.query.getFilter();

    // Get statistics
    const stats = await Model.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          },
          inactive: {
            $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] }
          },
          // Add more aggregations as needed
        }
      }
    ]);

    // Send response
    res.status(200).json({
      status: 'success',
      data: {
        stats: stats[0] || { total: 0, active: 0, inactive: 0 },
      },
    });
  });





  
// const AppError = require('../utils/appError');
// const ApiFeatures = require('../utils/ApiFeatures');
// const catchAsync = require('../utils/catchAsync');
// /* ===========================================================
//    DELETE ONE  — soft delete preferred for financial records
// =========================================================== */
// exports.deleteOne = (Model) =>
//   catchAsync(async (req, res, next) => {
//     const hasSoftDelete = !!Model.schema.path('isDeleted');

//     let doc;
//     if (hasSoftDelete) {
//       doc = await Model.findOneAndUpdate(
//         {
//           _id: req.params.id,
//           organizationId: req.user.organizationId,
//         },
//         { isDeleted: true, isActive: false },
//         { new: true }
//       );
//     } else {
//       doc = await Model.findOneAndDelete({
//         _id: req.params.id,
//         organizationId: req.user.organizationId,
//       });
//     }

//     if (!doc) return next(new AppError('No document found with that ID', 404));

//     res.status(204).json({
//       status: 'success',
//       data: null,
//     });
//   });

// /* ===========================================================
//    UPDATE ONE  — includes audit field
// =========================================================== */
// exports.updateOne = (Model) =>
//   catchAsync(async (req, res, next) => {
//     if (req.user) req.body.updatedBy = req.user.id;

//     const doc = await Model.findOneAndUpdate(
//       {
//         _id: req.params.id,
//         organizationId: req.user.organizationId,
//       },
//       req.body,
//       {
//         new: true,
//         runValidators: true,
//       }
//     );

//     if (!doc) return next(new AppError('No document found with that ID', 404));

//     res.status(200).json({
//       status: 'success',
//       data: {
//         data: doc,
//       },
//     });
//   });

// /* ===========================================================
//    CREATE ONE  — automatically assigns organization/branch
// =========================================================== */
// exports.createOne = (Model) =>
//   catchAsync(async (req, res, next) => {
//     // Auto-assign organization, branch, and creator
//     req.body.organizationId = req.user.organizationId;
//     req.body.createdBy = req.user.id;
//     if (req.user.branchId) req.body.branchId = req.user.branchId;
//     const doc = await Model.create(req.body);
//     res.status(201).json({
//       status: 'success',
//       data: {
//         data: doc,
//       },
//     });
//   });

// /* ===========================================================
//    GET ONE  — optionally populate references
// =========================================================== */
// exports.getOne = (Model, popOptions) =>
//   catchAsync(async (req, res, next) => {
//     let query = Model.findOne({
//       _id: req.params.id,
//       organizationId: req.user.organizationId,
//     });

//     if (popOptions) query = query.populate(popOptions);
//     const doc = await query;

//     if (!doc) return next(new AppError('No document found with that ID', 404));

//     res.status(200).json({
//       status: 'success',
//       data: {
//         data: doc,
//       },
//     });
//   });

// /* ===========================================================
//    GET ALL  — supports filtering, sorting, pagination
// =========================================================== */
// // exports.getAll = (Model) =>
// //   catchAsync(async (req, res, next) => {
// //     // Base filter: only documents for this organization
// //     const filter = {
// //       organizationId: req.user.organizationId,
// //     };

// //     // Exclude soft-deleted docs if applicable
// //     if (Model.schema.path('isDeleted')) {
// //       filter.isDeleted = { $ne: true };
// //     }

// //     // Build query using ApiFeatures utility
// //     const features = new ApiFeatures(Model.find(filter), req.query)
// //       .filter()
// //       .sort()
// //       .limitFields()
// //       .paginate();

// //     const docs = await features.query;

// //     res.status(200).json({
// //       status: 'success',
// //       results: docs.length,
// //       data: {
// //         data: docs,
// //       },
// //     });
// //   });
// /* ===========================================================
//    GET ALL — supports filtering, sorting, pagination
// =========================================================== */
// exports.getAll = (Model, popOptions) =>
//   catchAsync(async (req, res, next) => {
//     // 1. Base filter: only documents for this organization
//     const filter = {
//       organizationId: req.user.organizationId,
//     };

//     // 2. Exclude soft-deleted docs if applicable
//     if (Model.schema.path('isDeleted')) {
//       filter.isDeleted = { $ne: true };
//     }

//     // 3. Build query using ApiFeatures utility
//     const features = new ApiFeatures(Model.find(filter), req.query)
//       .filter()
//       .sort()
//       .limitFields()
//       .paginate();

//     // 4. Apply Populate (IF provided) BEFORE awaiting
//     if (popOptions) {
//       features.query = features.query.populate(popOptions);
//     }

//     // 5. Execute Query
//     const docs = await features.query;

//     res.status(200).json({
//       status: 'success',
//       results: docs.length,
//       data: {
//         data: docs,
//       },
//     });
//   });
// /* ===========================================================
//    OPTIONAL: RESTORE ONE  — for soft-deleted records
// =========================================================== */
// exports.restoreOne = (Model) =>
//   catchAsync(async (req, res, next) => {
//     if (!Model.schema.path('isDeleted')) {
//       return next(new AppError('This model does not support restoration', 400));
//     }

//     const doc = await Model.findOneAndUpdate(
//       {
//         _id: req.params.id,
//         organizationId: req.user.organizationId,
//       },
//       { isDeleted: false, isActive: true },
//       { new: true }
//     );

//     if (!doc) return next(new AppError('No document found with that ID', 404));

//     res.status(200).json({
//       status: 'success',
//       data: {
//         data: doc,
//       },
//     });
//   });


// // const AppError = require('./appError');
// // const APIFeatures = require('./apiFeatures'); // Assuming you copied this

// // /**
// //  * Catches async errors.
// //  * @param {Function} fn - The async function to wrap.
// //  */
// // const catchAsync = (fn) => {
// //   return (req, res, next) => {
// //     fn(req, res, next).catch(next);
// //   };
// // };

// // /**
// //  * @desc    Delete a document
// //  * @access  Private (organization-specific)
// //  */
// // exports.deleteOne = (Model) =>
// //   catchAsync(async (req, res, next) => {
// //     const doc = await Model.findOneAndDelete({
// //       _id: req.params.id,
// //       organizationId: req.user.organizationId, // SECURITY CHECK
// //     });

// //     if (!doc) {
// //       return next(new AppError('No document found with that ID', 404));
// //     }

// //     res.status(204).json({
// //       status: 'success',
// //       data: null,
// //     });
// //   });

// // /**
// //  * @desc    Update a document
// //  * @access  Private (organization-specific)
// //  */
// // exports.updateOne = (Model) =>
// //   catchAsync(async (req, res, next) => {
// //     // Add 'updatedBy' to the request body
// //     if (req.user) req.body.updatedBy = req.user.id;

// //     const doc = await Model.findOneAndUpdate(
// //       {
// //         _id: req.params.id,
// //         organizationId: req.user.organizationId, // SECURITY CHECK
// //       },
// //       req.body,
// //       {
// //         new: true,
// //         runValidators: true,
// //       }
// //     );

// //     if (!doc) {
// //       return next(new AppError('No document found with that ID', 404));
// //     }

// //     res.status(200).json({
// //       status: 'success',
// //       data: {
// //         data: doc,
// //       },
// //     });
// //   });

// // /**
// //  * @desc    Create a document
// //  * @access  Private (organization-specific)
// //  */
// // exports.createOne = (Model) =>
// //   catchAsync(async (req, res, next) => {
// //     // Add organizationId and createdBy from the logged-in user
// //     req.body.organizationId = req.user.organizationId;
// //     req.body.createdBy = req.user.id;
// //     // If the model has a branchId, add it from the user
// //     if (req.user.branchId) {
// //       req.body.branchId = req.user.branchId;
// //     }

// //     const doc = await Model.create(req.body);

// //     res.status(201).json({
// //       status: 'success',
// //       data: {
// //         data: doc,
// //       },
// //     });
// //   });

// // /**
// //  * @desc    Get one document
// //  * @access  Private (organization-specific)
// //  */
// // exports.getOne = (Model, popOptions) =>
// //   catchAsync(async (req, res, next) => {
// //     let query = Model.findOne({
// //       _id: req.params.id,
// //       organizationId: req.user.organizationId, // SECURITY CHECK
// //     });

// //     if (popOptions) query = query.populate(popOptions);
// //     const doc = await query;

// //     if (!doc) {
// //       return next(new AppError('No document found with that ID', 404));
// //     }

// //     res.status(200).json({
// //       status: 'success',
// //       data: {
// //         data: doc,
// //       },
// //     });
// //   });

// // /**
// //  * @desc    Get all documents
// //  * @access  Private (organization-specific)
// //  */
// // exports.getAll = (Model) =>
// //   catchAsync(async (req, res, next) => {
// //     // THIS IS THE KEY CHANGE for getAll
// //     // We create a base filter to only get docs for *this* organization
// //     const filter = { organizationId: req.user.organizationId };

// //     const features = new APIFeatures(Model.find(filter), req.query)
// //       .filter()
// //       .sort()
// //       .limitFields()
// //       .paginate();

// //     const docs = await features.query;

// //     res.status(200).json({
// //       status: 'success',
// //       results: docs.length,
// //       data: {
// //         data: docs,
// //       },
// //     });
// //   });
