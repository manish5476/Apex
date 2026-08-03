const catchAsync = require('../../core/utils/api/catchAsync');
const employeeService = require('./employee.service');
const { createEmployeeSchema, updateEmployeeSchema, deactivateEmployeeSchema } = require('./employee.validation');
const { success, created } = require('../../core/utils/response'); 
// Assuming `success` maps to standard res.status(200).json()

exports.getAllEmployees = catchAsync(async (req, res) => {
  const result = await employeeService.getList(req.user.organizationId, req.query);
  
  res.status(200).json({
    status: 'success',
    results: result.results,
    pagination: result.pagination,
    data: { employees: result.data },
  });
});

exports.getEmployee = catchAsync(async (req, res) => {
  const employee = await employeeService.getById(req.user.organizationId, req.params.id);
  return success(res, { employee });
});

exports.getEmployeeByUser = catchAsync(async (req, res) => {
  const employee = await employeeService.getByUserId(req.user.organizationId, req.params.userId);
  return success(res, { employee });
});

exports.createEmployee = catchAsync(async (req, res) => {
  // Validate request body
  const validatedData = createEmployeeSchema.parse(req.body); 

  const employee = await employeeService.create(
    req.user.organizationId, 
    validatedData, 
    req.user._id
  );
  
  return created(res, { employee });
});

exports.updateEmployee = catchAsync(async (req, res) => {
  // Validate request body
  const validatedData = updateEmployeeSchema.parse(req.body);

  const employee = await employeeService.update(
    req.user.organizationId, 
    req.params.id, 
    validatedData, 
    req.user._id
  );
  
  return success(res, { employee });
});

exports.deactivateEmployee = catchAsync(async (req, res) => {
  // Validate deactivation payload (ensures exitReason is provided, etc)
  const validatedData = deactivateEmployeeSchema.parse(req.body);

  const employee = await employeeService.deactivate(
    req.user.organizationId,
    req.params.id,
    validatedData,
    req.user._id
  );

  res.status(200).json({
    status: 'success',
    message: 'Employee deactivated and offboarding workflows completed.',
    data: { employee }
  });
});

const { getEmployee360Schema } = require('./employee.validation');

exports.getEmployeeWorkspace = catchAsync(async (req, res) => {
  // 1. Validate route params
  const { id } = getEmployee360Schema.parse(req.params);

  // 2. Execute service logic
  const workspace = await employeeService.getWorkspace360(
    req.user.organizationId, 
    id, 
    req.user
  );
  
  // 3. Return structured payload
  return success(res, workspace);
});
// 'use strict';

// const Employee = require('../../core-hr/models/employee.model');
// const User = require('../../../auth/core/user.model');
// const Department = require('../../core-hr/models/department.model');
// const Designation = require('../../core-hr/models/designation.model');
// const Branch = require('../../../organization/core/branch.model');
// const Shift = require('../../attendance/models/shift.model');

// const catchAsync = require('../../../../core/utils/api/catchAsync');
// const AppError = require('../../../../core/utils/api/appError');
// const employeePopulate = [
//   { path: 'user', select: 'name email phone avatar status isActive role branchId', populate: { path: 'role', select: 'name' } },
//   { path: 'branchId', select: 'name branchCode' },
//   { path: 'departmentId', select: 'name code' },
//   { path: 'designationId', select: 'title code level grade' },
//   { path: 'reportingManagerId', select: 'name email avatar' },
//   { path: 'attendanceConfig.shiftId', select: 'name startTime endTime' },
//   { path: 'attendanceConfig.shiftGroupId', select: 'name' },
//   { path: 'attendanceConfig.geoFenceId', select: 'name' },
// ];

// const validateOrgRefs = async (payload, orgId) => {
//   const checks = [];

//   if (payload.user) checks.push(User.exists({ _id: payload.user, organizationId: orgId }).then((ok) => ['User', ok]));
//   if (payload.branchId) checks.push(Branch.exists({ _id: payload.branchId, organizationId: orgId }).then((ok) => ['Branch', ok]));
//   if (payload.departmentId) checks.push(Department.exists({ _id: payload.departmentId, organizationId: orgId }).then((ok) => ['Department', ok]));
//   if (payload.designationId) checks.push(Designation.exists({ _id: payload.designationId, organizationId: orgId }).then((ok) => ['Designation', ok]));
//   if (payload.reportingManagerId) checks.push(User.exists({ _id: payload.reportingManagerId, organizationId: orgId }).then((ok) => ['Reporting Manager', ok]));
//   if (payload.attendanceConfig?.shiftId) {
//     checks.push(Shift.exists({ _id: payload.attendanceConfig.shiftId, organizationId: orgId }).then((ok) => ['Shift', ok]));
//   }

//   const results = await Promise.all(checks);
//   const invalid = results.find(([, ok]) => !ok);
//   if (invalid) throw new AppError(`Invalid ${invalid[0]} ID.`, 400);
// };



// exports.getAllEmployees = catchAsync(async (req, res) => {
//   const {
//     status,
//     branchId,
//     departmentId,
//     designationId,
//     reportingManagerId,
//     employmentType,
//     search,
//     page = 1,
//     limit = 50,
//   } = req.query;

//   const filter = { organizationId: req.user.organizationId };
//   if (status) filter.status = status;
//   if (branchId) filter.branchId = branchId;
//   if (departmentId) filter.departmentId = departmentId;
//   if (designationId) filter.designationId = designationId;
//   if (reportingManagerId) filter.reportingManagerId = reportingManagerId;
//   if (employmentType) filter.employmentType = employmentType;

//   const skip = (Math.max(1, Number(page)) - 1) * Math.min(200, Number(limit));
//   let query = Employee.find(filter).populate(employeePopulate).sort({ createdAt: -1 }).skip(skip).limit(Math.min(200, Number(limit)));

//   if (search) {
//     const regex = new RegExp(search, 'i');
//     query = Employee.find({
//       ...filter,
//       $or: [{ employeeId: regex }],
//     }).populate(employeePopulate).sort({ createdAt: -1 }).skip(skip).limit(Math.min(200, Number(limit)));
//   }

//   const [employees, total] = await Promise.all([
//     query,
//     Employee.countDocuments(filter),
//   ]);

//   res.status(200).json({
//     status: 'success',
//     results: employees.length,
//     pagination: { total, page: Number(page), limit: Math.min(200, Number(limit)) },
//     data: { employees },
//   });
// });

// exports.getEmployee = catchAsync(async (req, res, next) => {
//   const employee = await Employee.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId,
//   }).populate(employeePopulate);

//   if (!employee) return next(new AppError('Employee not found', 404));
//   res.status(200).json({ status: 'success', data: { employee } });
// });

// exports.getEmployeeByUser = catchAsync(async (req, res, next) => {
//   const employee = await Employee.findOne({
//     user: req.params.userId,
//     organizationId: req.user.organizationId,
//   }).populate(employeePopulate);

//   if (!employee) return next(new AppError('Employee not found for this user', 404));
//   res.status(200).json({ status: 'success', data: { employee } });
// });

// exports.createEmployee = catchAsync(async (req, res, next) => {
//   const payload = {
//     ...req.body,
//     organizationId: req.user.organizationId,
//     createdBy: req.user._id,
//     updatedBy: req.user._id,
//   };

//   await validateOrgRefs(payload, req.user.organizationId);

//   const employee = await Employee.create(payload);

//   const populated = await Employee.findById(employee._id).populate(employeePopulate);
//   res.status(201).json({ status: 'success', data: { employee: populated } });
// });

// exports.updateEmployee = catchAsync(async (req, res, next) => {
//   delete req.body.organizationId;
//   delete req.body.user;
//   delete req.body.createdBy;

//   await validateOrgRefs(req.body, req.user.organizationId);

//   const employee = await Employee.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     { $set: { ...req.body, updatedBy: req.user._id } },
//     { new: true, runValidators: true }
//   );

//   if (!employee) return next(new AppError('Employee not found', 404));

//   const populated = await Employee.findById(employee._id).populate(employeePopulate);
//   res.status(200).json({ status: 'success', data: { employee: populated } });
// });

// exports.deactivateEmployee = catchAsync(async (req, res, next) => {
//   const employee = await Employee.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     {
//       $set: {
//         status: req.body.status || 'inactive',
//         dateOfExit: req.body.dateOfExit || new Date(),
//         exitReason: req.body.exitReason,
//         updatedBy: req.user._id,
//       },
//     },
//     { new: true, runValidators: true }
//   );

//   if (!employee) return next(new AppError('Employee not found', 404));

//   // Also deactivate the user account to prevent login
//   await User.findByIdAndUpdate(employee.user, { isActive: false, status: 'inactive' });

//   res.status(200).json({ status: 'success', data: { employee } });
// });
