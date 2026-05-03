// controllers/core/designation.controller.js
const mongoose     = require('mongoose');
const Designation  = require('../../models/designation.model');
const User         = require('../../../auth/core/user.model');
const catchAsync   = require('../../../../core/utils/api/catchAsync');
const AppError     = require('../../../../core/utils/api/appError');
const factory      = require('../../../../core/utils/api/handlerFactory');

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/**
 * FIX BUG-DES-C01 [CRITICAL] — title/code uniqueness only checked when provided.
 * FIX BUG-DES-C02 [CRITICAL] — career level check uses merged level, not just request body.
 *
 * @param {Object}   data           Request body fields
 * @param {ObjectId} organizationId
 * @param {ObjectId} [currentId]    Existing doc ID (for updates — skip self in uniqueness check)
 * @param {Object}   [existing]     The existing designation document (for level context on update)
 */
const validateDesignationData = async (data, organizationId, currentId = null, existing = null) => {
  const { title, code } = data;

  // FIX BUG-DES-C01 — Only check title if actually provided
  if (title) {
    const titleExists = await Designation.findOne({ organizationId, title, _id: { $ne: currentId } });
    if (titleExists) throw new AppError('Designation with this title already exists', 400);
  }

  // FIX BUG-DES-C01 — Only check code if actually provided
  if (code) {
    const codeExists = await Designation.findOne({ organizationId, code, _id: { $ne: currentId } });
    if (codeExists) throw new AppError('Designation with this code already exists', 400);
  }

  if (data.nextDesignation) {
    const next = await Designation.findOne({ _id: data.nextDesignation, organizationId });
    if (!next) throw new AppError('Next designation not found', 400);

    // FIX BUG-DES-C02 [CRITICAL] — Use existing level as fallback when not provided in update.
    // Original: used `data.level` which is undefined when level is omitted from the request,
    // making `next.level <= undefined` → false → validation silently passes for backwards paths.
    const currentLevel = data.level ?? existing?.level;
    if (currentLevel !== undefined && next.level <= currentLevel) {
      throw new AppError(`Next designation level (${next.level}) must be higher than current (${currentLevel})`, 400);
    }
  }

  if (data.reportsTo?.length) {
    const validReportsTo = await Designation.find({ _id: { $in: data.reportsTo }, organizationId });
    if (validReportsTo.length !== data.reportsTo.length) {
      throw new AppError('One or more reporting designations not found', 400);
    }
  }

  // Guard: salaryBand.min <= max
  if (data.salaryBand?.min !== undefined && data.salaryBand?.max !== undefined) {
    if (data.salaryBand.min > data.salaryBand.max) {
      throw new AppError('salaryBand.min cannot exceed salaryBand.max', 400);
    }
  }
};

// ─────────────────────────────────────────────
//  CRUD
// ─────────────────────────────────────────────

exports.createDesignation = catchAsync(async (req, res, next) => {
  req.body.organizationId = req.user.organizationId;
  req.body.createdBy      = req.user._id;
  req.body.updatedBy      = req.user._id;

  await validateDesignationData(req.body, req.user.organizationId);

  const designation = await Designation.create(req.body);
  res.status(201).json({ status: 'success', data: { designation } });
});

exports.getAllDesignations = factory.getAll(Designation, {
  searchFields: ['title', 'code', 'description', 'jobFamily'],
  includeInactive: true,
  populate: [
    { path: 'nextDesignation', select: 'title code level' },
    { path: 'reportsTo',       select: 'title code level' },
    { path: 'createdBy',       select: 'name' },
  ],
  sort: { level: 1, grade: 1, title: 1 },
});

exports.getDesignation = factory.getOne(Designation, {
  populate: [
    { path: 'nextDesignation', select: 'title code level grade salaryBand' },
    { path: 'reportsTo',       select: 'title code level' },
    { path: 'createdBy',       select: 'name' },
    { path: 'updatedBy',       select: 'name' },
  ],
});

/**
 * PATCH /api/v1/designations/:id
 *
 * FIX BUG-DES-C02 — passes existing document to validator for level context.
 */
exports.updateDesignation = catchAsync(async (req, res, next) => {
  const designation = await Designation.findOne({
    _id: req.params.id, organizationId: req.user.organizationId,
  });
  if (!designation) return next(new AppError('Designation not found', 404));

  if (req.body.title || req.body.code || req.body.nextDesignation !== undefined) {
    // FIX BUG-DES-C02 — pass existing designation for level fallback
    await validateDesignationData(req.body, req.user.organizationId, req.params.id, designation);
  }

  req.body.updatedBy = req.user._id;
  const updated = await Designation.findByIdAndUpdate(
    req.params.id, { $set: req.body }, { new: true, runValidators: true }
  );

  res.status(200).json({ status: 'success', data: { designation: updated } });
});

exports.deleteDesignation = catchAsync(async (req, res, next) => {
  const designation = await Designation.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!designation) return next(new AppError('Designation not found', 404));

  const [employeeCount, referencedAsNext] = await Promise.all([
    User.countDocuments({ organizationId: req.user.organizationId, 'employeeProfile.designationId': designation._id, isActive: true }),
    Designation.countDocuments({ organizationId: req.user.organizationId, nextDesignation: designation._id }),
  ]);

  if (employeeCount > 0) return next(new AppError(`Cannot delete designation with ${employeeCount} active employees.`, 400));
  if (referencedAsNext > 0) return next(new AppError('Cannot delete: referenced as next designation in career path.', 400));

  designation.isActive  = false;
  designation.updatedBy = req.user._id;
  await designation.save();

  res.status(204).json({ status: 'success', data: null });
});

// ─────────────────────────────────────────────
//  SPECIALIZED OPERATIONS
// ─────────────────────────────────────────────

/**
 * GET /api/v1/designations/career-path/:id
 *
 * FIX BUG-DES-C03 [HIGH] — Infinite loop protection with visited Set + iteration cap.
 * FIX BUG-DES-C04 [HIGH] — Pre-fetches all designations once; traverses in memory (no N+1).
 */
exports.getCareerPath = catchAsync(async (req, res, next) => {
  const startDesignation = await Designation.findOne({
    _id: req.params.id, organizationId: req.user.organizationId, isActive: true,
  });
  if (!startDesignation) return next(new AppError('Designation not found', 404));

  // FIX BUG-DES-C04 — Pre-fetch all org designations; build an in-memory map.
  // Original made one DB call per career level (N+1 in a while loop).
  const allDesignations = await Designation.find({
    organizationId: req.user.organizationId,
    isActive: true,
  }).select('title code level grade salaryBand promotionAfterYears nextDesignation').lean();

  const designationMap = new Map(allDesignations.map(d => [d._id.toString(), d]));

  // FIX BUG-DES-C03 — Track visited IDs to prevent infinite loop on circular data
  const careerPath = [];
  const visited    = new Set();
  const MAX_LEVELS = 20;
  let current      = designationMap.get(startDesignation._id.toString());

  while (current && careerPath.length <= MAX_LEVELS) {
    const id = current._id.toString();
    if (visited.has(id)) break; // Circular reference guard
    visited.add(id);

    careerPath.push({
      _id:                current._id,
      title:              current.title,
      code:               current.code,
      level:              current.level,
      grade:              current.grade,
      salaryBand:         current.salaryBand,
      promotionAfterYears:current.promotionAfterYears,
    });

    current = current.nextDesignation
      ? designationMap.get(current.nextDesignation.toString())
      : null;
  }

  const lateralMoves = allDesignations.filter(
    d => d.level === startDesignation.level && d._id.toString() !== startDesignation._id.toString()
  );

  res.status(200).json({
    status: 'success',
    data: {
      current:      startDesignation,
      careerPath:   careerPath.slice(1), // Remove self
      lateralMoves,
    },
  });
});

exports.getDesignationHierarchy = catchAsync(async (req, res, next) => {
  const designations = await Designation.find({
    organizationId: req.user.organizationId, isActive: true,
  }).select('title code level grade jobFamily reportsTo').lean();

  const byLevel = {};
  designations.forEach(d => {
    (byLevel[d.level] = byLevel[d.level] || []).push(d);
  });

  const topLevel = designations.filter(d => !d.reportsTo || d.reportsTo.length === 0);

  const buildReportingTree = (parent) => {
    const children = designations.filter(d =>
      d.reportsTo?.some(r => r.toString() === parent._id.toString())
    );
    return { ...parent, children: children.map(child => buildReportingTree(child)) };
  };

  const reportingHierarchy = topLevel.map(d => buildReportingTree(d));

  res.status(200).json({ status: 'success', data: { byLevel, reportingHierarchy } });
});

exports.getDesignationEmployees = catchAsync(async (req, res, next) => {
  const designation = await Designation.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!designation) return next(new AppError('Designation not found', 404));

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  const query = {
    organizationId:                          req.user.organizationId,
    'employeeProfile.designationId':         designation._id,
    isActive:                                req.query.isActive !== 'false',
  };

  const [employees, total] = await Promise.all([
    User.find(query)
      .select('name email phone avatar employeeProfile.departmentId employeeProfile.employeeId status')
      .populate('employeeProfile.departmentId', 'name')
      .skip(skip).limit(limit).sort({ name: 1 }),
    User.countDocuments(query),
  ]);

  res.status(200).json({ status: 'success', results: employees.length, total, page, totalPages: Math.ceil(total / limit), data: { employees } });
});

exports.getSalaryBands = catchAsync(async (req, res, next) => {
  const bands = await Designation.aggregate([
    { $match: { organizationId: req.user.organizationId, isActive: true, 'salaryBand.min': { $exists: true } } },
    {
      $group: {
        _id:          { level: '$level', grade: '$grade' },
        minSalary:    { $min: '$salaryBand.min' },
        maxSalary:    { $max: '$salaryBand.max' },
        avgSalary:    { $avg: '$salaryBand.min' },
        designations: { $push: { title: '$title', code: '$code' } },
        count:        { $sum: 1 },
      },
    },
    { $sort: { '_id.level': 1, '_id.grade': 1 } },
  ]);

  res.status(200).json({ status: 'success', data: { internal: bands } });
});

/**
 * GET /api/v1/designations/promotion-eligible
 *
 * FIX BUG-DES-C05 [HIGH] — Promotion eligibility cutoff uses setFullYear() for accurate
 * year subtraction, instead of `years * 365 * 24 * 60 * 60 * 1000` (drifts on leap years).
 */
exports.getPromotionEligible = catchAsync(async (req, res, next) => {
  const { designationId } = req.query;
  // FIX BUG-DES-C05 — use integer years not millisecond approximation
  const years = Math.max(0, parseInt(req.query.years) || 2);

  if (!designationId) return next(new AppError('Please provide designation ID', 400));

  const designation = await Designation.findOne({ _id: designationId, organizationId: req.user.organizationId });
  if (!designation) return next(new AppError('Designation not found', 404));

  // FIX BUG-DES-C05 — setFullYear handles leap years and calendar correctly
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);

  const eligibleEmployees = await User.find({
    organizationId:                        req.user.organizationId,
    'employeeProfile.designationId':       designation._id,
    'employeeProfile.dateOfJoining':       { $lte: cutoff },
    isActive: true,
    status:   'approved',
  })
    .select('name employeeProfile.employeeId employeeProfile.dateOfJoining employeeProfile.departmentId')
    .populate('employeeProfile.departmentId', 'name')
    .lean();

  let nextDesignation = null;
  if (designation.nextDesignation) {
    nextDesignation = await Designation.findById(designation.nextDesignation).select('title code level grade salaryBand');
  }

  res.status(200).json({
    status: 'success',
    data: { currentDesignation: designation, nextDesignation, eligibleCount: eligibleEmployees.length, employees: eligibleEmployees },
  });
});

exports.bulkCreateDesignations = catchAsync(async (req, res, next) => {
  const { designations } = req.body;
  if (!Array.isArray(designations) || designations.length === 0) {
    return next(new AppError('Please provide an array of designations', 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const created = [];
    const errors  = [];

    for (const data of designations) {
      try {
        data.organizationId = req.user.organizationId;
        data.createdBy      = req.user._id;
        data.updatedBy      = req.user._id;
        await validateDesignationData(data, req.user.organizationId);
        const [d] = await Designation.create([data], { session });
        created.push(d);
      } catch (error) {
        errors.push({ data, error: error.message });
      }
    }

    await session.commitTransaction();
    res.status(201).json({ status: 'success', results: created.length, errors: errors.length, data: { designations: created, errors } });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// // controllers/core/designation.controller.js
// const mongoose = require('mongoose');
// const Designation = require('../../models/designation.model');
// const User = require('../../../auth/core/user.model');
// const catchAsync = require('../../../../core/utils/api/catchAsync');
// const AppError = require('../../../../core/utils/api/appError');
// const factory = require('../../../../core/utils/api/handlerFactory');

// // ======================================================
// // HELPERS & VALIDATIONS
// // ======================================================

// const validateDesignationData = async (data, organizationId, excludeId = null) => {
//   const { title, code } = data;
  
//   // Check unique title
//   const titleExists = await Designation.findOne({
//     organizationId,
//     title,
//     _id: { $ne: excludeId }
//   });
//   if (titleExists) throw new AppError('Designation with this title already exists', 400);
  
//   // Check unique code
//   const codeExists = await Designation.findOne({
//     organizationId,
//     code,
//     _id: { $ne: excludeId }
//   });
//   if (codeExists) throw new AppError('Designation with this code already exists', 400);
  
//   // Validate next designation if provided
//   if (data.nextDesignation) {
//     const next = await Designation.findOne({
//       _id: data.nextDesignation,
//       organizationId
//     });
//     if (!next) throw new AppError('Next designation not found', 400);
    
//     // Ensure career progression is forward
//     if (next.level <= data.level) {
//       throw new AppError('Next designation must have higher level', 400);
//     }
//   }
  
//   // Validate reportsTo designations
//   if (data.reportsTo && data.reportsTo.length) {
//     const validReportsTo = await Designation.find({
//       _id: { $in: data.reportsTo },
//       organizationId
//     });
//     if (validReportsTo.length !== data.reportsTo.length) {
//       throw new AppError('One or more reporting designations not found', 400);
//     }
//   }
// };

// // ======================================================
// // CRUD OPERATIONS
// // ======================================================

// /**
//  * @desc    Create new designation
//  * @route   POST /api/v1/designations
//  * @access  Private (Admin/HR)
//  */
// exports.createDesignation = catchAsync(async (req, res, next) => {
//   // Set organization and audit fields
//   req.body.organizationId = req.user.organizationId;
//   req.body.createdBy = req.user._id;
//   req.body.updatedBy = req.user._id;
  
//   // Validate data
//   await validateDesignationData(req.body, req.user.organizationId);
  
//   // Create designation
//   const designation = await Designation.create(req.body);
  
//   res.status(201).json({
//     status: 'success',
//     data: { designation }
//   });
// });

// /**
//  * @desc    Get all designations
//  * @route   GET /api/v1/designations
//  * @access  Private
//  */
// exports.getAllDesignations = factory.getAll(Designation, {
//   searchFields: ['title', 'code', 'description', 'jobFamily'],
//   populate: [
//     { path: 'nextDesignation', select: 'title code level' },
//     { path: 'reportsTo', select: 'title code level' },
//     { path: 'createdBy', select: 'name' }
//   ],
//   sort: { level: 1, grade: 1, title: 1 }
// });

// /**
//  * @desc    Get single designation
//  * @route   GET /api/v1/designations/:id
//  * @access  Private
//  */
// exports.getDesignation = factory.getOne(Designation, {
//   populate: [
//     { path: 'nextDesignation', select: 'title code level grade salaryBand' },
//     { path: 'reportsTo', select: 'title code level' },
//     { path: 'createdBy', select: 'name' },
//     { path: 'updatedBy', select: 'name' }
//   ]
// });

// /**
//  * @desc    Update designation
//  * @route   PATCH /api/v1/designations/:id
//  * @access  Private (Admin/HR)
//  */
// exports.updateDesignation = catchAsync(async (req, res, next) => {
//   const designation = await Designation.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!designation) {
//     return next(new AppError('Designation not found', 404));
//   }
  
//   // Validate updates
//   if (req.body.title || req.body.code) {
//     await validateDesignationData(req.body, req.user.organizationId, req.params.id);
//   }
  
//   // Set audit field
//   req.body.updatedBy = req.user._id;
  
//   const updatedDesignation = await Designation.findByIdAndUpdate(
//     req.params.id,
//     { $set: req.body },
//     { new: true, runValidators: true }
//   );
  
//   res.status(200).json({
//     status: 'success',
//     data: { designation: updatedDesignation }
//   });
// });

// /**
//  * @desc    Delete designation (soft delete)
//  * @route   DELETE /api/v1/designations/:id
//  * @access  Private (Admin only)
//  */
// exports.deleteDesignation = catchAsync(async (req, res, next) => {
//   const designation = await Designation.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!designation) {
//     return next(new AppError('Designation not found', 404));
//   }
  
//   // Check if designation is in use
//   const employeeCount = await User.countDocuments({
//     organizationId: req.user.organizationId,
//     'employeeProfile.designationId': designation._id,
//     isActive: true
//   });
  
//   if (employeeCount > 0) {
//     return next(new AppError(
//       `Cannot delete designation with ${employeeCount} active employees. Please reassign employees first.`,
//       400
//     ));
//   }
  
//   // Check if it's referenced as next designation
//   const referencedAsNext = await Designation.countDocuments({
//     organizationId: req.user.organizationId,
//     nextDesignation: designation._id
//   });
  
//   if (referencedAsNext > 0) {
//     return next(new AppError(
//       'Cannot delete designation as it is referenced as next designation in career path',
//       400
//     ));
//   }
  
//   // Soft delete
//   designation.isActive = false;
//   designation.updatedBy = req.user._id;
//   await designation.save();
  
//   res.status(204).json({
//     status: 'success',
//     data: null
//   });
// });

// // ======================================================
// // SPECIALIZED OPERATIONS
// // ======================================================

// /**
//  * @desc    Get career path
//  * @route   GET /api/v1/designations/career-path/:id
//  * @access  Private
//  */
// exports.getCareerPath = catchAsync(async (req, res, next) => {
//   const startDesignation = await Designation.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId,
//     isActive: true
//   });
  
//   if (!startDesignation) {
//     return next(new AppError('Designation not found', 404));
//   }
  
//   // Build career path forward
//   const careerPath = [];
//   let current = startDesignation;
  
//   while (current) {
//     careerPath.push({
//       _id: current._id,
//       title: current.title,
//       code: current.code,
//       level: current.level,
//       grade: current.grade,
//       salaryBand: current.salaryBand,
//       promotionAfterYears: current.promotionAfterYears
//     });
    
//     if (!current.nextDesignation) break;
    
//     current = await Designation.findById(current.nextDesignation)
//       .select('title code level grade salaryBand promotionAfterYears nextDesignation');
//   }
  
//   // Get lateral moves (same level, different job families)
//   const lateralMoves = await Designation.find({
//     organizationId: req.user.organizationId,
//     level: startDesignation.level,
//     _id: { $ne: startDesignation._id },
//     isActive: true
//   }).select('title code grade jobFamily');
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       current: startDesignation,
//       careerPath: careerPath.slice(1), // Remove current from path
//       lateralMoves
//     }
//   });
// });

// /**
//  * @desc    Get designation hierarchy
//  * @route   GET /api/v1/designations/hierarchy
//  * @access  Private
//  */
// exports.getDesignationHierarchy = catchAsync(async (req, res, next) => {
//   const designations = await Designation.find({
//     organizationId: req.user.organizationId,
//     isActive: true
//   })
//   .select('title code level grade jobFamily reportsTo')
//   .lean();
  
//   // Group by level
//   const byLevel = {};
//   designations.forEach(d => {
//     if (!byLevel[d.level]) byLevel[d.level] = [];
//     byLevel[d.level].push(d);
//   });
  
//   // Build reporting structure
//   const reportingHierarchy = [];
  
//   // Find top-level (no reportsTo or reportsTo empty)
//   const topLevel = designations.filter(d => !d.reportsTo || d.reportsTo.length === 0);
  
//   const buildReportingTree = (parent) => {
//     const children = designations.filter(d => 
//       d.reportsTo?.some(r => r.toString() === parent._id.toString())
//     );
    
//     return {
//       ...parent,
//       children: children.map(child => buildReportingTree(child))
//     };
//   };
  
//   topLevel.forEach(d => {
//     reportingHierarchy.push(buildReportingTree(d));
//   });
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       byLevel,
//       reportingHierarchy
//     }
//   });
// });

// /**
//  * @desc    Get employees by designation
//  * @route   GET /api/v1/designations/:id/employees
//  * @access  Private
//  */
// exports.getDesignationEmployees = catchAsync(async (req, res, next) => {
//   const designation = await Designation.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!designation) {
//     return next(new AppError('Designation not found', 404));
//   }
  
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 20;
//   const skip = (page - 1) * limit;
  
//   const query = {
//     organizationId: req.user.organizationId,
//     'employeeProfile.designationId': designation._id,
//     isActive: req.query.isActive !== 'false'
//   };
  
//   const [employees, total] = await Promise.all([
//     User.find(query)
//       .select('name email phone avatar employeeProfile.departmentId employeeProfile.employeeId status')
//       .populate('employeeProfile.departmentId', 'name')
//       .skip(skip)
//       .limit(limit)
//       .sort(req.query.sort || 'name'),
//     User.countDocuments(query)
//   ]);
  
//   res.status(200).json({
//     status: 'success',
//     results: employees.length,
//     total,
//     page,
//     totalPages: Math.ceil(total / limit),
//     data: { employees }
//   });
// });

// /**
//  * @desc    Get salary bands by level
//  * @route   GET /api/v1/designations/salary-bands
//  * @access  Private (Admin/Finance)
//  */
// exports.getSalaryBands = catchAsync(async (req, res, next) => {
//   const bands = await Designation.aggregate([
//     {
//       $match: {
//         organizationId: req.user.organizationId,
//         isActive: true,
//         'salaryBand.min': { $exists: true }
//       }
//     },
//     {
//       $group: {
//         _id: { level: '$level', grade: '$grade' },
//         minSalary: { $min: '$salaryBand.min' },
//         maxSalary: { $max: '$salaryBand.max' },
//         avgSalary: { $avg: '$salaryBand.min' },
//         designations: { $push: { title: '$title', code: '$code' } },
//         count: { $sum: 1 }
//       }
//     },
//     {
//       $sort: { '_id.level': 1, '_id.grade': 1 }
//     }
//   ]);
  
//   // Get current market rates (could integrate with external API)
//   const marketRates = {
//     // This would be dynamic in production
//     'A': { min: 1000000, max: 3000000 },
//     'B': { min: 500000, max: 1500000 },
//     'C': { min: 300000, max: 800000 }
//   };
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       internal: bands,
//       marketRates
//     }
//   });
// });

// /**
//  * @desc    Get promotion eligibility
//  * @route   GET /api/v1/designations/promotion-eligible
//  * @access  Private
//  */
// exports.getPromotionEligible = catchAsync(async (req, res, next) => {
//   const { designationId, years = 2 } = req.query;
  
//   if (!designationId) {
//     return next(new AppError('Please provide designation ID', 400));
//   }
  
//   const designation = await Designation.findOne({
//     _id: designationId,
//     organizationId: req.user.organizationId
//   });
  
//   if (!designation) {
//     return next(new AppError('Designation not found', 404));
//   }
  
//   // Find employees with this designation who joined more than X years ago
//   const eligibleEmployees = await User.find({
//     organizationId: req.user.organizationId,
//     'employeeProfile.designationId': designation._id,
//     'employeeProfile.dateOfJoining': {
//       $lte: new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000)
//     },
//     isActive: true,
//     status: 'approved'
//   })
//   .select('name employeeProfile.employeeId employeeProfile.dateOfJoining employeeProfile.departmentId')
//   .populate('employeeProfile.departmentId', 'name')
//   .populate('employeeProfile.designationId', 'title')
//   .lean();
  
//   // Get next designation info
//   let nextDesignation = null;
//   if (designation.nextDesignation) {
//     nextDesignation = await Designation.findById(designation.nextDesignation)
//       .select('title code level grade salaryBand');
//   }
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       currentDesignation: designation,
//       nextDesignation,
//       eligibleCount: eligibleEmployees.length,
//       employees: eligibleEmployees
//     }
//   });
// });

// /**
//  * @desc    Bulk create designations
//  * @route   POST /api/v1/designations/bulk
//  * @access  Private (Admin only)
//  */
// exports.bulkCreateDesignations = catchAsync(async (req, res, next) => {
//   const { designations } = req.body;
  
//   if (!Array.isArray(designations) || designations.length === 0) {
//     return next(new AppError('Please provide an array of designations', 400));
//   }
  
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     const created = [];
//     const errors = [];
    
//     for (const data of designations) {
//       try {
//         // Set common fields
//         data.organizationId = req.user.organizationId;
//         data.createdBy = req.user._id;
//         data.updatedBy = req.user._id;
        
//         // Validate uniqueness
//         await validateDesignationData(data, req.user.organizationId);
        
//         const designation = await Designation.create([data], { session });
//         created.push(designation[0]);
//       } catch (error) {
//         errors.push({
//           data,
//           error: error.message
//         });
//       }
//     }
    
//     await session.commitTransaction();
    
//     res.status(201).json({
//       status: 'success',
//       results: created.length,
//       errors: errors.length,
//       data: { designations: created, errors }
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });
