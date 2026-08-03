const catchAsync = require('../../../../core/utils/api/catchAsync');
const designationService = require('../services/designation/designation.service');
const { createDesignationSchema, updateDesignationSchema } = require('../validation/designation.validation');
const { success, created, noContent } = require('../../middleware/responseFormatter'); 

exports.getAllDesignations = catchAsync(async (req, res) => {
  const result = await designationService.getList(req.user.organizationId, req.query);
  return success(res, result.data, 200, result.pagination);
});

exports.getDesignation = catchAsync(async (req, res) => {
  const designation = await designationService.getById(req.user.organizationId, req.params.id);
  return success(res, { designation });
});

exports.createDesignation = catchAsync(async (req, res) => {
  const validatedData = createDesignationSchema.parse(req.body);
  const designation = await designationService.create(req.user.organizationId, validatedData, req.user._id);
  return created(res, { designation });
});

exports.updateDesignation = catchAsync(async (req, res) => {
  const validatedData = updateDesignationSchema.parse(req.body);
  const designation = await designationService.update(req.user.organizationId, req.params.id, validatedData, req.user._id);
  return success(res, { designation });
});

exports.deleteDesignation = catchAsync(async (req, res) => {
  await designationService.delete(req.user.organizationId, req.params.id, req.user._id);
  return noContent(res);
});

// --- Specialized Operations ---

exports.getCareerPath = catchAsync(async (req, res) => {
  const careerData = await designationService.getCareerPath(req.user.organizationId, req.params.id);
  return success(res, careerData);
});

exports.getSalaryBands = catchAsync(async (req, res) => {
  const bands = await designationService.getSalaryBands(req.user.organizationId);
  return success(res, { internal: bands });
});

exports.getPromotionEligible = catchAsync(async (req, res) => {
  if (!req.query.designationId) {
    return res.status(400).json({ status: 'fail', message: 'Please provide a designationId' });
  }

  const eligibilityData = await designationService.getPromotionEligible(
    req.user.organizationId, 
    req.query.designationId,
    req.query.years
  );
  
  return success(res, eligibilityData);
});

exports.getDesignationHierarchy = catchAsync(async (req, res) => {
  const result = await designationService.getDesignationHierarchy(req.user.organizationId);
  return success(res, result);
});

exports.getDesignationEmployees = catchAsync(async (req, res) => {
  const result = await designationService.getDesignationEmployees(req.user.organizationId, req.params.id, req.query);
  return success(res, { employees: result.employees }, 200, result.pagination);
});

exports.bulkCreateDesignations = catchAsync(async (req, res) => {
  const result = await designationService.bulkCreateDesignations(req.user.organizationId, req.body.designations, req.user._id);
  return created(res, result);
});

// // controllers/core/designation.controller.js
// const mongoose     = require('mongoose');
// const Designation  = require('../../core-hr/models/designation.model');
// const User         = require('../../../auth/core/user.model');
// const Employee     = require('../../core-hr/models/employee.model');
// const catchAsync   = require('../../../../core/utils/api/catchAsync');
// const AppError     = require('../../../../core/utils/api/appError');
// const factory      = require('../../../../core/utils/api/handlerFactory');

// // ─────────────────────────────────────────────
// //  HELPERS
// // ─────────────────────────────────────────────

// /**
//  * FIX BUG-DES-C01 [CRITICAL] — title/code uniqueness only checked when provided.
//  * FIX BUG-DES-C02 [CRITICAL] — career level check uses merged level, not just request body.
//  *
//  * @param {Object}   data           Request body fields
//  * @param {ObjectId} organizationId
//  * @param {ObjectId} [currentId]    Existing doc ID (for updates — skip self in uniqueness check)
//  * @param {Object}   [existing]     The existing designation document (for level context on update)
//  */
// const validateDesignationData = async (data, organizationId, currentId = null, existing = null) => {
//   const { title, code } = data;

//   // FIX BUG-DES-C01 — Only check title if actually provided
//   if (title) {
//     const titleExists = await Designation.findOne({ organizationId, title, _id: { $ne: currentId } });
//     if (titleExists) throw new AppError('Designation with this title already exists', 400);
//   }

//   // FIX BUG-DES-C01 — Only check code if actually provided
//   if (code) {
//     const codeExists = await Designation.findOne({ organizationId, code, _id: { $ne: currentId } });
//     if (codeExists) throw new AppError('Designation with this code already exists', 400);
//   }

//   if (data.nextDesignation) {
//     const next = await Designation.findOne({ _id: data.nextDesignation, organizationId });
//     if (!next) throw new AppError('Next designation not found', 400);

//     // FIX BUG-DES-C02 [CRITICAL] — Use existing level as fallback when not provided in update.
//     // Original: used `data.level` which is undefined when level is omitted from the request,
//     // making `next.level <= undefined` → false → validation silently passes for backwards paths.
//     const currentLevel = data.level ?? existing?.level;
//     if (currentLevel !== undefined && next.level <= currentLevel) {
//       throw new AppError(`Next designation level (${next.level}) must be higher than current (${currentLevel})`, 400);
//     }
//   }

//   if (data.reportsTo?.length) {
//     const validReportsTo = await Designation.find({ _id: { $in: data.reportsTo }, organizationId });
//     if (validReportsTo.length !== data.reportsTo.length) {
//       throw new AppError('One or more reporting designations not found', 400);
//     }
//   }

//   // Guard: salaryBand.min <= max
//   if (data.salaryBand?.min !== undefined && data.salaryBand?.max !== undefined) {
//     if (data.salaryBand.min > data.salaryBand.max) {
//       throw new AppError('salaryBand.min cannot exceed salaryBand.max', 400);
//     }
//   }
// };

// // ─────────────────────────────────────────────
// //  CRUD
// // ─────────────────────────────────────────────

// exports.createDesignation = catchAsync(async (req, res, next) => {
//   req.body.organizationId = req.user.organizationId;
//   req.body.createdBy      = req.user._id;
//   req.body.updatedBy      = req.user._id;

//   await validateDesignationData(req.body, req.user.organizationId);

//   const designation = await Designation.create(req.body);
//   res.status(201).json({ status: 'success', data: { designation } });
// });

// exports.getAllDesignations = factory.getAll(Designation, {
//   searchFields: ['title', 'code', 'description', 'jobFamily'],
//   includeInactive: true,
//   populate: [
//     { path: 'nextDesignation', select: 'title code level' },
//     { path: 'reportsTo',       select: 'title code level' },
//     { path: 'createdBy',       select: 'name' },
//   ],
//   sort: { level: 1, grade: 1, title: 1 },
// });

// exports.getDesignation = factory.getOne(Designation, {
//   populate: [
//     { path: 'nextDesignation', select: 'title code level grade salaryBand' },
//     { path: 'reportsTo',       select: 'title code level' },
//     { path: 'createdBy',       select: 'name' },
//     { path: 'updatedBy',       select: 'name' },
//   ],
// });

// /**
//  * PATCH /api/v1/designations/:id
//  *
//  * FIX BUG-DES-C02 — passes existing document to validator for level context.
//  */
// exports.updateDesignation = catchAsync(async (req, res, next) => {
//   const designation = await Designation.findOne({
//     _id: req.params.id, organizationId: req.user.organizationId,
//   });
//   if (!designation) return next(new AppError('Designation not found', 404));

//   if (req.body.title || req.body.code || req.body.nextDesignation !== undefined) {
//     // FIX BUG-DES-C02 — pass existing designation for level fallback
//     await validateDesignationData(req.body, req.user.organizationId, req.params.id, designation);
//   }

//   req.body.updatedBy = req.user._id;
//   const updated = await Designation.findByIdAndUpdate(
//     req.params.id, { $set: req.body }, { new: true, runValidators: true }
//   );

//   res.status(200).json({ status: 'success', data: { designation: updated } });
// });

// exports.deleteDesignation = catchAsync(async (req, res, next) => {
//   const designation = await Designation.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!designation) return next(new AppError('Designation not found', 404));

//   const [employeeCount, referencedAsNext] = await Promise.all([
//     Employee.countDocuments({ organizationId: req.user.organizationId, designationId: designation._id }),
//     Designation.countDocuments({ organizationId: req.user.organizationId, nextDesignation: designation._id }),
//   ]);

//   if (employeeCount > 0) return next(new AppError(`Cannot delete designation with ${employeeCount} active employees.`, 400));
//   if (referencedAsNext > 0) return next(new AppError('Cannot delete: referenced as next designation in career path.', 400));

//   designation.isActive  = false;
//   designation.updatedBy = req.user._id;
//   await designation.save();

//   res.status(204).json({ status: 'success', data: null });
// });

// // ─────────────────────────────────────────────
// //  SPECIALIZED OPERATIONS
// // ─────────────────────────────────────────────

// /**
//  * GET /api/v1/designations/career-path/:id
//  *
//  * FIX BUG-DES-C03 [HIGH] — Infinite loop protection with visited Set + iteration cap.
//  * FIX BUG-DES-C04 [HIGH] — Pre-fetches all designations once; traverses in memory (no N+1).
//  */
// exports.getCareerPath = catchAsync(async (req, res, next) => {
//   const startDesignation = await Designation.findOne({
//     _id: req.params.id, organizationId: req.user.organizationId, isActive: true,
//   });
//   if (!startDesignation) return next(new AppError('Designation not found', 404));

//   // FIX BUG-DES-C04 — Pre-fetch all org designations; build an in-memory map.
//   // Original made one DB call per career level (N+1 in a while loop).
//   const allDesignations = await Designation.find({
//     organizationId: req.user.organizationId,
//     isActive: true,
//   }).select('title code level grade salaryBand promotionAfterYears nextDesignation').lean();

//   const designationMap = new Map(allDesignations.map(d => [d._id.toString(), d]));

//   // FIX BUG-DES-C03 — Track visited IDs to prevent infinite loop on circular data
//   const careerPath = [];
//   const visited    = new Set();
//   const MAX_LEVELS = 20;
//   let current      = designationMap.get(startDesignation._id.toString());

//   while (current && careerPath.length <= MAX_LEVELS) {
//     const id = current._id.toString();
//     if (visited.has(id)) break; // Circular reference guard
//     visited.add(id);

//     careerPath.push({
//       _id:                current._id,
//       title:              current.title,
//       code:               current.code,
//       level:              current.level,
//       grade:              current.grade,
//       salaryBand:         current.salaryBand,
//       promotionAfterYears:current.promotionAfterYears,
//     });

//     current = current.nextDesignation
//       ? designationMap.get(current.nextDesignation.toString())
//       : null;
//   }

//   const lateralMoves = allDesignations.filter(
//     d => d.level === startDesignation.level && d._id.toString() !== startDesignation._id.toString()
//   );

//   res.status(200).json({
//     status: 'success',
//     data: {
//       current:      startDesignation,
//       careerPath:   careerPath.slice(1), // Remove self
//       lateralMoves,
//     },
//   });
// });

// exports.getDesignationHierarchy = catchAsync(async (req, res, next) => {
//   const designations = await Designation.find({
//     organizationId: req.user.organizationId, isActive: true,
//   }).select('title code level grade jobFamily reportsTo').lean();

//   const byLevel = {};
//   designations.forEach(d => {
//     (byLevel[d.level] = byLevel[d.level] || []).push(d);
//   });

//   const topLevel = designations.filter(d => !d.reportsTo || d.reportsTo.length === 0);

//   const buildReportingTree = (parent) => {
//     const children = designations.filter(d =>
//       d.reportsTo?.some(r => r.toString() === parent._id.toString())
//     );
//     return { ...parent, children: children.map(child => buildReportingTree(child)) };
//   };

//   const reportingHierarchy = topLevel.map(d => buildReportingTree(d));

//   res.status(200).json({ status: 'success', data: { byLevel, reportingHierarchy } });
// });

// exports.getDesignationEmployees = catchAsync(async (req, res, next) => {
//   const designation = await Designation.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!designation) return next(new AppError('Designation not found', 404));

//   const page  = Math.max(1, parseInt(req.query.page)  || 1);
//   const limit = Math.min(100, parseInt(req.query.limit) || 20);
//   const skip  = (page - 1) * limit;

//   const query = {
//     organizationId: req.user.organizationId,
//     designationId:  designation._id,
//   };

//   const [employees, total] = await Promise.all([
//     Employee.find(query)
//       .select('user departmentId employeeId designationId')
//       .populate('user', 'name email phone avatar status isActive')
//       .populate('departmentId', 'name')
//       .skip(skip).limit(limit).sort({ createdAt: -1 }),
//     Employee.countDocuments(query),
//   ]);

//   res.status(200).json({ status: 'success', results: employees.length, total, page, totalPages: Math.ceil(total / limit), data: { employees } });
// });

// exports.getSalaryBands = catchAsync(async (req, res, next) => {
//   const bands = await Designation.aggregate([
//     { $match: { organizationId: req.user.organizationId, isActive: true, 'salaryBand.min': { $exists: true } } },
//     {
//       $group: {
//         _id:          { level: '$level', grade: '$grade' },
//         minSalary:    { $min: '$salaryBand.min' },
//         maxSalary:    { $max: '$salaryBand.max' },
//         avgSalary:    { $avg: '$salaryBand.min' },
//         designations: { $push: { title: '$title', code: '$code' } },
//         count:        { $sum: 1 },
//       },
//     },
//     { $sort: { '_id.level': 1, '_id.grade': 1 } },
//   ]);

//   res.status(200).json({ status: 'success', data: { internal: bands } });
// });

// /**
//  * GET /api/v1/designations/promotion-eligible
//  *
//  * FIX BUG-DES-C05 [HIGH] — Promotion eligibility cutoff uses setFullYear() for accurate
//  * year subtraction, instead of `years * 365 * 24 * 60 * 60 * 1000` (drifts on leap years).
//  */
// exports.getPromotionEligible = catchAsync(async (req, res, next) => {
//   const { designationId } = req.query;
//   // FIX BUG-DES-C05 — use integer years not millisecond approximation
//   const years = Math.max(0, parseInt(req.query.years) || 2);

//   if (!designationId) return next(new AppError('Please provide designation ID', 400));

//   const designation = await Designation.findOne({ _id: designationId, organizationId: req.user.organizationId });
//   if (!designation) return next(new AppError('Designation not found', 404));

//   // FIX BUG-DES-C05 — setFullYear handles leap years and calendar correctly
//   const cutoff = new Date();
//   cutoff.setFullYear(cutoff.getFullYear() - years);

//   const eligibleEmployees = await Employee.find({
//     organizationId: req.user.organizationId,
//     designationId:  designation._id,
//     dateOfJoining:  { $lte: cutoff },
//   })
//     .select('user employeeId dateOfJoining departmentId designationId')
//     .populate('user', 'name status isActive')
//     .populate('departmentId', 'name')
//     .lean();

//   let nextDesignation = null;
//   if (designation.nextDesignation) {
//     nextDesignation = await Designation.findById(designation.nextDesignation).select('title code level grade salaryBand');
//   }

//   res.status(200).json({
//     status: 'success',
//     data: { currentDesignation: designation, nextDesignation, eligibleCount: eligibleEmployees.length, employees: eligibleEmployees },
//   });
// });

// exports.bulkCreateDesignations = catchAsync(async (req, res, next) => {
//   const { designations } = req.body;
//   if (!Array.isArray(designations) || designations.length === 0) {
//     return next(new AppError('Please provide an array of designations', 400));
//   }

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const created = [];
//     const errors  = [];

//     for (const data of designations) {
//       try {
//         data.organizationId = req.user.organizationId;
//         data.createdBy      = req.user._id;
//         data.updatedBy      = req.user._id;
//         await validateDesignationData(data, req.user.organizationId);
//         const [d] = await Designation.create([data], { session });
//         created.push(d);
//       } catch (error) {
//         errors.push({ data, error: error.message });
//       }
//     }

//     await session.commitTransaction();
//     res.status(201).json({ status: 'success', results: created.length, errors: errors.length, data: { designations: created, errors } });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });
