const catchAsync = require('../../../../core/utils/api/catchAsync');
const departmentService = require('../services/department/department.service');
const { createDepartmentSchema, updateDepartmentSchema } = require('../validation/department.validation');
const { success, created, noContent } = require('../../middleware/responseFormatter'); 

exports.getAllDepartments = catchAsync(async (req, res) => {
  // If ?tree=true, return the hierarchical structure instead of tabular pagination
  if (req.query.tree === 'true') {
    const hierarchy = await departmentService.getTreeHierarchy(req.user.organizationId);
    return success(res, { hierarchy });
  }

  const result = await departmentService.getList(req.user.organizationId, req.query);
  return success(res, result.data, 200, result.pagination);
});

exports.getDepartment = catchAsync(async (req, res) => {
  const department = await departmentService.getById(req.user.organizationId, req.params.id);
  return success(res, { department });
});

exports.createDepartment = catchAsync(async (req, res) => {
  const validatedData = createDepartmentSchema.parse(req.body);
  
  const department = await departmentService.create(
    req.user.organizationId, 
    validatedData, 
    req.user._id
  );
  
  return created(res, { department });
});

exports.updateDepartment = catchAsync(async (req, res) => {
  const validatedData = updateDepartmentSchema.parse(req.body);
  
  const department = await departmentService.update(
    req.user.organizationId, 
    req.params.id, 
    validatedData, 
    req.user._id
  );
  
  return success(res, { department });
});

exports.deleteDepartment = catchAsync(async (req, res) => {
  await departmentService.delete(req.user.organizationId, req.params.id, req.user._id);
  return noContent(res);
});

exports.getDepartmentStats = catchAsync(async (req, res) => {
  const stats = await departmentService.getStats(req.user.organizationId);
  return success(res, { stats });
});

exports.getDepartmentHierarchy = catchAsync(async (req, res) => {
  const hierarchy = await departmentService.getTreeHierarchy(req.user.organizationId);
  return success(res, { hierarchy });
});

exports.bulkUpdateDepartments = catchAsync(async (req, res) => {
  const results = await departmentService.bulkUpdate(req.user.organizationId, req.body.operations, req.user._id);
  return success(res, { operations: results });
});

exports.getDepartmentEmployees = catchAsync(async (req, res) => {
  const result = await departmentService.getDepartmentEmployees(req.user.organizationId, req.params.id, req.query);
  return success(res, { employees: result.employees }, 200, result.pagination);
});

// // controllers/core/department.controller.js
// const mongoose   = require('mongoose');
// const Department = require('../../core-hr/models/department.model');
// const User       = require('../../../auth/core/user.model');
// const Employee   = require('../../core-hr/models/employee.model');
// const catchAsync = require('../../../../core/utils/api/catchAsync');
// const AppError   = require('../../../../core/utils/api/appError');
// const factory    = require('../../../../core/utils/api/handlerFactory');
// const { escapeRegex } =require('../../../../core/utils/leaveHelpers');

// // ─────────────────────────────────────────────
// //  HELPERS
// // ─────────────────────────────────────────────

// /**
//  * Validate department name/code uniqueness and parent relationship.
//  *
//  * FIX BUG-DEP-C04 [HIGH] — Code uniqueness only checked when code is actually provided.
//  * Original queried `{ code: undefined }` which matches null/missing-field documents,
//  * producing a false "already exists" error on updates that don't touch code.
//  *
//  * FIX BUG-DEP-C01 [CRITICAL] — Circular reference detection fixed.
//  * Original: `parent.path?.includes(excludeId.toString())` used string `.includes()`
//  * which can match partial IDs (e.g. "abc" matches inside "xyzabcdef").
//  * Fixed: uses a word-boundary regex `/(?:^|\/)id(?:\/|$)/` for exact segment matching.
//  */
// const validateDepartmentData = async (data, organizationId, currentId = null) => {
//   const { name, code, parentDepartment, headOfDepartment } = data;

//   // Check unique name (only if provided)
//   if (name) {
//     const nameExists = await Department.findOne({ organizationId, name, _id: { $ne: currentId } });
//     if (nameExists) throw new AppError('Department with this name already exists', 400);
//   }

//   // FIX BUG-DEP-C04 — Only check code if actually provided
//   if (code) {
//     const codeExists = await Department.findOne({ organizationId, code, _id: { $ne: currentId } });
//     if (codeExists) throw new AppError('Department with this code already exists', 400);
//   }

//   if (parentDepartment) {
//     const parent = await Department.findOne({ _id: parentDepartment, organizationId });
//     if (!parent) throw new AppError('Parent department not found', 400);

//     // FIX BUG-DEP-C01 [CRITICAL] — Use exact segment match to prevent partial-ID false positives.
//     // Old code: `parent.path?.includes(excludeId.toString())` — '.includes()' on strings
//     // matches substring, so ID "abc" would match inside path segment "xyzabc123".
//     if (currentId) {
//       const escapedId = escapeRegex(currentId.toString());
//       const circularRegex = new RegExp(`(?:^|/)${escapedId}(?:/|$)`);
//       if (parent.path && circularRegex.test(parent.path)) {
//         throw new AppError('Circular department reference: this would create a loop in the hierarchy', 400);
//       }
//     }
//   }

//   if (headOfDepartment) {
//     const hod = await User.findOne({ _id: headOfDepartment, organizationId, isActive: true });
//     if (!hod) throw new AppError('Head of Department user not found or inactive', 400);
//   }
// };

// // ─────────────────────────────────────────────
// //  CRUD
// // ─────────────────────────────────────────────

// /**
//  * POST /api/v1/departments
//  *
//  * FIX BUG-DEP-C08 [MEDIUM] — Removed incorrect parent employeeCount increment.
//  * A new department has 0 employees — incrementing the parent's count because
//  * a sub-department was created inflated all ancestor employeeCount values.
//  */
// exports.createDepartment = catchAsync(async (req, res, next) => {
//   req.body.organizationId = req.user.organizationId;
//   req.body.createdBy      = req.user._id;
//   req.body.updatedBy      = req.user._id;

//   await validateDepartmentData(req.body, req.user.organizationId);

//   const department = await Department.create(req.body);

//   // FIX BUG-DEP-C03 [CRITICAL] — HOD assignment does NOT change the HOD's departmentId.
//   // The HOD field on the department is a role/leadership reference, not a membership record.
//   // Modifying the user's departmentId based on HOD assignment would silently move
//   // them out of their actual department (e.g., a CEO heading multiple depts).
//   // departmentId on User should be managed by HR explicitly, not derived from HOD status.

//   res.status(201).json({ status: 'success', data: { department } });
// });

// /**
//  * GET /api/v1/departments
//  *
//  * FIX BUG-DEP-C06 [HIGH] — Tree view ObjectId key lookup uses explicit .toString()
//  * to ensure consistent Map key comparison regardless of Mongoose version.
//  */
// exports.getAllDepartments = catchAsync(async (req, res, next) => {
//   req.query.organizationId = req.user.organizationId;

//   if (req.query.tree === 'true') {
//     const departments = await Department.find({
//       organizationId: req.user.organizationId,
//       isActive: req.query.isActive !== 'false',
//     })
//       .populate('headOfDepartment', 'name avatar')
//       .lean();

//     // FIX BUG-DEP-C06 — Build map with explicit string keys to avoid ObjectId key mismatch
//     const deptMap = {};
//     departments.forEach(dept => {
//       dept.children = [];
//       deptMap[dept._id.toString()] = dept;  // explicit .toString()
//     });

//     const roots = [];
//     departments.forEach(dept => {
//       const parentKey = dept.parentDepartment?.toString();
//       if (parentKey && deptMap[parentKey]) {
//         deptMap[parentKey].children.push(dept);
//       } else {
//         roots.push(dept);
//       }
//     });

//     return res.status(200).json({ status: 'success', results: roots.length, data: { departments: roots } });
//   }

//   return factory.getAll(Department, {
//     searchFields: ['name', 'code', 'description'],
//     includeInactive: true,
//     populate: [
//       { path: 'headOfDepartment', select: 'name avatar' },
//       { path: 'parentDepartment', select: 'name code' },
//       { path: 'branchId',         select: 'name' },
//     ],
//     sort: { level: 1, name: 1 },
//   })(req, res, next);
// });

// exports.getDepartment = factory.getOne(Department, {
//   populate: [
//     { path: 'headOfDepartment', select: 'name email phone avatar' },
//     { path: 'assistantHOD',     select: 'name email' },
//     { path: 'parentDepartment', select: 'name code path' },
//     { path: 'branchId',         select: 'name' },
//     { path: 'createdBy',        select: 'name' },
//     { path: 'updatedBy',        select: 'name' },
//   ],
// });

// /**
//  * PATCH /api/v1/departments/:id
//  *
//  * FIX BUG-DEP-C03 [CRITICAL] — HOD change no longer overwrites user's departmentId.
//  * The previous code silently moved the new HOD's department membership to THIS department,
//  * which is wrong. HOD is a leadership role, not a department membership assignment.
//  */
// exports.updateDepartment = catchAsync(async (req, res, next) => {
//   const department = await Department.findOne({
//     _id:            req.params.id,
//     organizationId: req.user.organizationId,
//   });

//   if (!department) return next(new AppError('Department not found', 404));

//   if (req.body.name || req.body.code || req.body.parentDepartment) {
//     await validateDepartmentData(req.body, req.user.organizationId, req.params.id);
//   }

//   req.body.updatedBy = req.user._id;

//   // Handle parent department change (path cascade is handled in model pre-save)
//   const parentChanged =
//     req.body.parentDepartment !== undefined &&
//     req.body.parentDepartment?.toString() !== department.parentDepartment?.toString();

//   const updatedDepartment = await Department.findByIdAndUpdate(
//     req.params.id,
//     { $set: req.body },
//     { new: true, runValidators: true }
//   );

//   res.status(200).json({ status: 'success', data: { department: updatedDepartment } });
// });

// /**
//  * DELETE /api/v1/departments/:id
//  */
// exports.deleteDepartment = catchAsync(async (req, res, next) => {
//   const department = await Department.findOne({
//     _id: req.params.id, organizationId: req.user.organizationId,
//   });
//   if (!department) return next(new AppError('Department not found', 404));

//   const [employeeCount, childCount] = await Promise.all([
//     Employee.countDocuments({ organizationId: req.user.organizationId, departmentId: department._id }),
//     Department.countDocuments({ organizationId: req.user.organizationId, parentDepartment: department._id, isActive: true }),
//   ]);

//   if (employeeCount > 0) return next(new AppError(`Cannot delete department with ${employeeCount} active employees. Please reassign first.`, 400));
//   if (childCount > 0)    return next(new AppError('Cannot delete department with child departments.', 400));

//   department.isActive  = false;
//   department.updatedBy = req.user._id;
//   await department.save();

//   res.status(204).json({ status: 'success', data: null });
// });

// // ─────────────────────────────────────────────
// //  SPECIALIZED OPERATIONS
// // ─────────────────────────────────────────────

// exports.getDepartmentHierarchy = catchAsync(async (req, res, next) => {
//   const departments = await Department.find({ organizationId: req.user.organizationId, isActive: true })
//     .select('name code level path headOfDepartment employeeCount parentDepartment')
//     .populate('headOfDepartment', 'name avatar')
//     .lean();

//   // FIX BUG-DEP-C06 — Explicit toString() for all ObjectId key lookups
//   const buildTree = (parentId = null) =>
//     departments
//       .filter(d =>
//         parentId === null
//           ? !d.parentDepartment
//           : d.parentDepartment?.toString() === parentId?.toString()
//       )
//       .map(d => ({ ...d, children: buildTree(d._id) }));

//   res.status(200).json({ status: 'success', data: { hierarchy: buildTree() } });
// });

// /**
//  * GET /api/v1/departments/:id/employees
//  *
//  * FIX BUG-DEP-C02 [CRITICAL] — Path regex is now escaped before use in RegExp.
//  * Unescaped paths like "/abc+def" would throw a regex syntax error or silently
//  * return wrong results.
//  */
// exports.getDepartmentEmployees = catchAsync(async (req, res, next) => {
//   const department = await Department.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!department) return next(new AppError('Department not found', 404));

//   const page  = Math.max(1, parseInt(req.query.page)  || 1);
//   const limit = Math.min(100, parseInt(req.query.limit) || 20);
//   const skip  = (page - 1) * limit;

//   let departmentIds = [department._id];

//   if (req.query.includeSubDepts === 'true') {
//     // FIX BUG-DEP-C02 — Escape department.path before building RegExp
//     const escapedPath = escapeRegex(department.path);
//     const descendants = await Department.find({
//       organizationId: req.user.organizationId,
//       path: new RegExp(`^${escapedPath}/`), // strictly descendants (not self)
//     }).select('_id');
//     departmentIds = [...departmentIds, ...descendants.map(d => d._id)];
//   }

//   const query = {
//     organizationId: req.user.organizationId,
//     departmentId:   { $in: departmentIds },
//   };

//   const [employees, total] = await Promise.all([
//     Employee.find(query)
//       .select('user departmentId designationId employmentType')
//       .populate('user', 'name email phone avatar status isActive')
//       .populate('designationId', 'title grade')
//       .skip(skip).limit(limit).sort({ createdAt: -1 }),
//     Employee.countDocuments(query),
//   ]);

//   res.status(200).json({ status: 'success', results: employees.length, total, page, totalPages: Math.ceil(total / limit), data: { employees } });
// });

// /**
//  * POST /api/v1/departments/bulk
//  *
//  * FIX BUG-DEP-C07 [MEDIUM] — Whitelist allowed fields in bulk update.
//  * Original spread raw `op.data` directly — attacker could override organizationId, path, etc.
//  */
// exports.bulkUpdateDepartments = catchAsync(async (req, res, next) => {
//   const { operations } = req.body;
//   if (!Array.isArray(operations)) return next(new AppError('Operations must be an array', 400));

//   const ALLOWED_UPDATE_FIELDS = ['name', 'code', 'description', 'headOfDepartment', 'assistantHOD',
//     'branchId', 'costCenter', 'budgetCode', 'maxStrength', 'contactEmail', 'contactPhone', 'location', 'isActive'];

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const results = [];

//     for (const op of operations) {
//       if (op.action === 'create') {
//         op.data.organizationId = req.user.organizationId;
//         op.data.createdBy      = req.user._id;
//         op.data.updatedBy      = req.user._id;
//         const dept = await Department.create([op.data], { session });
//         results.push({ action: 'create', data: dept[0] });

//       } else if (op.action === 'update' && op.id) {
//         // FIX BUG-DEP-C07 — Only allow whitelisted fields
//         const safeData = {};
//         ALLOWED_UPDATE_FIELDS.forEach(f => { if (op.data[f] !== undefined) safeData[f] = op.data[f]; });
//         const dept = await Department.findOneAndUpdate(
//           { _id: op.id, organizationId: req.user.organizationId },
//           { $set: { ...safeData, updatedBy: req.user._id } },
//           { new: true, session }
//         );
//         results.push({ action: 'update', id: op.id, data: dept });

//       } else if (op.action === 'delete' && op.id) {
//         await Department.findOneAndUpdate(
//           { _id: op.id, organizationId: req.user.organizationId },
//           { $set: { isActive: false, updatedBy: req.user._id } },
//           { session }
//         );
//         results.push({ action: 'delete', id: op.id });
//       }
//     }

//     await session.commitTransaction();
//     res.status(200).json({ status: 'success', results: results.length, data: { operations: results } });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// /**
//  * GET /api/v1/departments/stats/summary
//  *
//  * FIX BUG-DEP-C05 [HIGH] — Added $lookup for headOfDepartment to get hodName.
//  * Original referenced `$headOfDepartment.name` in $project without a prior $lookup —
//  * headOfDepartment is an ObjectId, so the name was always null.
//  */
// exports.getDepartmentStats = catchAsync(async (req, res, next) => {
//   const stats = await Department.aggregate([
//     { $match: { organizationId: req.user.organizationId, isActive: true } },
//     {
//       $lookup: {
//         from:         'users',
//         localField:   '_id',
//         foreignField: 'employeeProfile.departmentId',
//         as:           'employees',
//       },
//     },
//     // FIX BUG-DEP-C05 — Lookup HOD user to get their name
//     {
//       $lookup: {
//         from:         'users',
//         localField:   'headOfDepartment',
//         foreignField: '_id',
//         as:           'hodUser',
//       },
//     },
//     {
//       $project: {
//         name:  1,
//         code:  1,
//         level: 1,
//         employeeCount: { $size: '$employees' },
//         activeEmployees: {
//           $size: {
//             $filter: { input: '$employees', as: 'emp', cond: { $eq: ['$$emp.isActive', true] } },
//           },
//         },
//         // FIX BUG-DEP-C05 — Now correctly sourced from the $lookup result
//         hodName: { $arrayElemAt: ['$hodUser.name', 0] },
//       },
//     },
//     {
//       $group: {
//         _id:                 null,
//         totalDepartments:    { $sum: 1 },
//         totalEmployees:      { $sum: '$employeeCount' },
//         avgEmployeesPerDept: { $avg: '$employeeCount' },
//         departments:         { $push: '$$ROOT' },
//       },
//     },
//   ]);

//   res.status(200).json({ status: 'success', data: { stats: stats[0] || { totalDepartments: 0, totalEmployees: 0 } } });
// });
