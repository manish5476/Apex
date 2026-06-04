'use strict';

const Employee = require('../../models/employee.model');
const User = require('../../../auth/core/user.model');
const Department = require('../../models/department.model');
const Designation = require('../../models/designation.model');
const Branch = require('../../../organization/core/branch.model');
const Shift = require('../../models/shift.model');

const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError = require('../../../../core/utils/api/appError');
const employeePopulate = [
  { path: 'user', select: 'name email phone avatar status isActive role branchId', populate: { path: 'role', select: 'name' } },
  { path: 'branchId', select: 'name branchCode' },
  { path: 'departmentId', select: 'name code' },
  { path: 'designationId', select: 'title code level grade' },
  { path: 'reportingManagerId', select: 'name email avatar' },
  { path: 'attendanceConfig.shiftId', select: 'name startTime endTime' },
  { path: 'attendanceConfig.shiftGroupId', select: 'name' },
  { path: 'attendanceConfig.geoFenceId', select: 'name' },
];

const validateOrgRefs = async (payload, orgId) => {
  const checks = [];

  if (payload.user) checks.push(User.exists({ _id: payload.user, organizationId: orgId }).then((ok) => ['User', ok]));
  if (payload.branchId) checks.push(Branch.exists({ _id: payload.branchId, organizationId: orgId }).then((ok) => ['Branch', ok]));
  if (payload.departmentId) checks.push(Department.exists({ _id: payload.departmentId, organizationId: orgId }).then((ok) => ['Department', ok]));
  if (payload.designationId) checks.push(Designation.exists({ _id: payload.designationId, organizationId: orgId }).then((ok) => ['Designation', ok]));
  if (payload.reportingManagerId) checks.push(User.exists({ _id: payload.reportingManagerId, organizationId: orgId }).then((ok) => ['Reporting Manager', ok]));
  if (payload.attendanceConfig?.shiftId) {
    checks.push(Shift.exists({ _id: payload.attendanceConfig.shiftId, organizationId: orgId }).then((ok) => ['Shift', ok]));
  }

  const results = await Promise.all(checks);
  const invalid = results.find(([, ok]) => !ok);
  if (invalid) throw new AppError(`Invalid ${invalid[0]} ID.`, 400);
};



exports.getAllEmployees = catchAsync(async (req, res) => {
  const {
    status,
    branchId,
    departmentId,
    designationId,
    reportingManagerId,
    employmentType,
    search,
    page = 1,
    limit = 50,
  } = req.query;

  const filter = { organizationId: req.user.organizationId };
  if (status) filter.status = status;
  if (branchId) filter.branchId = branchId;
  if (departmentId) filter.departmentId = departmentId;
  if (designationId) filter.designationId = designationId;
  if (reportingManagerId) filter.reportingManagerId = reportingManagerId;
  if (employmentType) filter.employmentType = employmentType;

  const skip = (Math.max(1, Number(page)) - 1) * Math.min(200, Number(limit));
  let query = Employee.find(filter).populate(employeePopulate).sort({ createdAt: -1 }).skip(skip).limit(Math.min(200, Number(limit)));

  if (search) {
    const regex = new RegExp(search, 'i');
    query = Employee.find({
      ...filter,
      $or: [{ employeeId: regex }],
    }).populate(employeePopulate).sort({ createdAt: -1 }).skip(skip).limit(Math.min(200, Number(limit)));
  }

  const [employees, total] = await Promise.all([
    query,
    Employee.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    results: employees.length,
    pagination: { total, page: Number(page), limit: Math.min(200, Number(limit)) },
    data: { employees },
  });
});

exports.getEmployee = catchAsync(async (req, res, next) => {
  const employee = await Employee.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  }).populate(employeePopulate);

  if (!employee) return next(new AppError('Employee not found', 404));
  res.status(200).json({ status: 'success', data: { employee } });
});

exports.getEmployeeByUser = catchAsync(async (req, res, next) => {
  const employee = await Employee.findOne({
    user: req.params.userId,
    organizationId: req.user.organizationId,
  }).populate(employeePopulate);

  if (!employee) return next(new AppError('Employee not found for this user', 404));
  res.status(200).json({ status: 'success', data: { employee } });
});

exports.createEmployee = catchAsync(async (req, res, next) => {
  const payload = {
    ...req.body,
    organizationId: req.user.organizationId,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  };

  await validateOrgRefs(payload, req.user.organizationId);

  const employee = await Employee.create(payload);

  const populated = await Employee.findById(employee._id).populate(employeePopulate);
  res.status(201).json({ status: 'success', data: { employee: populated } });
});

exports.updateEmployee = catchAsync(async (req, res, next) => {
  delete req.body.organizationId;
  delete req.body.user;
  delete req.body.createdBy;

  await validateOrgRefs(req.body, req.user.organizationId);

  const employee = await Employee.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { $set: { ...req.body, updatedBy: req.user._id } },
    { new: true, runValidators: true }
  );

  if (!employee) return next(new AppError('Employee not found', 404));

  const populated = await Employee.findById(employee._id).populate(employeePopulate);
  res.status(200).json({ status: 'success', data: { employee: populated } });
});

exports.deactivateEmployee = catchAsync(async (req, res, next) => {
  const employee = await Employee.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    {
      $set: {
        status: req.body.status || 'inactive',
        dateOfExit: req.body.dateOfExit || new Date(),
        exitReason: req.body.exitReason,
        updatedBy: req.user._id,
      },
    },
    { new: true, runValidators: true }
  );

  if (!employee) return next(new AppError('Employee not found', 404));

  // Also deactivate the user account to prevent login
  await User.findByIdAndUpdate(employee.user, { isActive: false, status: 'inactive' });

  res.status(200).json({ status: 'success', data: { employee } });
});
