const AppError = require('../utils/appError');
const ApiFeatures = require('../utils/apiFeatures');
const catchAsync = require('../utils/catchAsync');

/**
 * Generic factory controller for CRUD operations.
 * Ensures every document operation is scoped by organizationId
 * (multi-tenant safety).
 */

/* ===========================================================
   DELETE ONE  — soft delete preferred for financial records
=========================================================== */
exports.deleteOne = (Model) =>
  catchAsync(async (req, res, next) => {
    // Check if model has isDeleted flag
    const hasSoftDelete = !!Model.schema.path('isDeleted');

    let doc;
    if (hasSoftDelete) {
      doc = await Model.findOneAndUpdate(
        {
          _id: req.params.id,
          organizationId: req.user.organizationId,
        },
        { isDeleted: true, isActive: false },
        { new: true }
      );
    } else {
      doc = await Model.findOneAndDelete({
        _id: req.params.id,
        organizationId: req.user.organizationId,
      });
    }

    if (!doc) return next(new AppError('No document found with that ID', 404));

    res.status(204).json({
      status: 'success',
      data: null,
    });
  });

/* ===========================================================
   UPDATE ONE  — includes audit field
=========================================================== */
exports.updateOne = (Model) =>
  catchAsync(async (req, res, next) => {
    if (req.user) req.body.updatedBy = req.user.id;

    const doc = await Model.findOneAndUpdate(
      {
        _id: req.params.id,
        organizationId: req.user.organizationId,
      },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!doc) return next(new AppError('No document found with that ID', 404));

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

/* ===========================================================
   CREATE ONE  — automatically assigns organization/branch
=========================================================== */
exports.createOne = (Model) =>
  catchAsync(async (req, res, next) => {
    // Auto-assign organization, branch, and creator
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user.id;
    if (req.user.branchId) req.body.branchId = req.user.branchId;

    const doc = await Model.create(req.body);

    res.status(201).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

/* ===========================================================
   GET ONE  — optionally populate references
=========================================================== */
exports.getOne = (Model, popOptions) =>
  catchAsync(async (req, res, next) => {
    let query = Model.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (popOptions) query = query.populate(popOptions);
    const doc = await query;

    if (!doc) return next(new AppError('No document found with that ID', 404));

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

/* ===========================================================
   GET ALL  — supports filtering, sorting, pagination
=========================================================== */
exports.getAll = (Model) =>
  catchAsync(async (req, res, next) => {
    // Base filter: only documents for this organization
    const filter = {
      organizationId: req.user.organizationId,
    };

    // Exclude soft-deleted docs if applicable
    if (Model.schema.path('isDeleted')) {
      filter.isDeleted = { $ne: true };
    }

    // Build query using ApiFeatures utility
    const features = new ApiFeatures(Model.find(filter), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const docs = await features.query;

    res.status(200).json({
      status: 'success',
      results: docs.length,
      data: {
        data: docs,
      },
    });
  });

/* ===========================================================
   OPTIONAL: RESTORE ONE  — for soft-deleted records
=========================================================== */
exports.restoreOne = (Model) =>
  catchAsync(async (req, res, next) => {
    if (!Model.schema.path('isDeleted')) {
      return next(new AppError('This model does not support restoration', 400));
    }

    const doc = await Model.findOneAndUpdate(
      {
        _id: req.params.id,
        organizationId: req.user.organizationId,
      },
      { isDeleted: false, isActive: true },
      { new: true }
    );

    if (!doc) return next(new AppError('No document found with that ID', 404));

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });


// const AppError = require('./appError');
// const APIFeatures = require('./apiFeatures'); // Assuming you copied this

// /**
//  * Catches async errors.
//  * @param {Function} fn - The async function to wrap.
//  */
// const catchAsync = (fn) => {
//   return (req, res, next) => {
//     fn(req, res, next).catch(next);
//   };
// };

// /**
//  * @desc    Delete a document
//  * @access  Private (organization-specific)
//  */
// exports.deleteOne = (Model) =>
//   catchAsync(async (req, res, next) => {
//     const doc = await Model.findOneAndDelete({
//       _id: req.params.id,
//       organizationId: req.user.organizationId, // SECURITY CHECK
//     });

//     if (!doc) {
//       return next(new AppError('No document found with that ID', 404));
//     }

//     res.status(204).json({
//       status: 'success',
//       data: null,
//     });
//   });

// /**
//  * @desc    Update a document
//  * @access  Private (organization-specific)
//  */
// exports.updateOne = (Model) =>
//   catchAsync(async (req, res, next) => {
//     // Add 'updatedBy' to the request body
//     if (req.user) req.body.updatedBy = req.user.id;

//     const doc = await Model.findOneAndUpdate(
//       {
//         _id: req.params.id,
//         organizationId: req.user.organizationId, // SECURITY CHECK
//       },
//       req.body,
//       {
//         new: true,
//         runValidators: true,
//       }
//     );

//     if (!doc) {
//       return next(new AppError('No document found with that ID', 404));
//     }

//     res.status(200).json({
//       status: 'success',
//       data: {
//         data: doc,
//       },
//     });
//   });

// /**
//  * @desc    Create a document
//  * @access  Private (organization-specific)
//  */
// exports.createOne = (Model) =>
//   catchAsync(async (req, res, next) => {
//     // Add organizationId and createdBy from the logged-in user
//     req.body.organizationId = req.user.organizationId;
//     req.body.createdBy = req.user.id;
//     // If the model has a branchId, add it from the user
//     if (req.user.branchId) {
//       req.body.branchId = req.user.branchId;
//     }

//     const doc = await Model.create(req.body);

//     res.status(201).json({
//       status: 'success',
//       data: {
//         data: doc,
//       },
//     });
//   });

// /**
//  * @desc    Get one document
//  * @access  Private (organization-specific)
//  */
// exports.getOne = (Model, popOptions) =>
//   catchAsync(async (req, res, next) => {
//     let query = Model.findOne({
//       _id: req.params.id,
//       organizationId: req.user.organizationId, // SECURITY CHECK
//     });

//     if (popOptions) query = query.populate(popOptions);
//     const doc = await query;

//     if (!doc) {
//       return next(new AppError('No document found with that ID', 404));
//     }

//     res.status(200).json({
//       status: 'success',
//       data: {
//         data: doc,
//       },
//     });
//   });

// /**
//  * @desc    Get all documents
//  * @access  Private (organization-specific)
//  */
// exports.getAll = (Model) =>
//   catchAsync(async (req, res, next) => {
//     // THIS IS THE KEY CHANGE for getAll
//     // We create a base filter to only get docs for *this* organization
//     const filter = { organizationId: req.user.organizationId };

//     const features = new APIFeatures(Model.find(filter), req.query)
//       .filter()
//       .sort()
//       .limitFields()
//       .paginate();

//     const docs = await features.query;

//     res.status(200).json({
//       status: 'success',
//       results: docs.length,
//       data: {
//         data: docs,
//       },
//     });
//   });