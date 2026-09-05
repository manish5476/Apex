'use strict';

const catchAsync = require('../../../../core/utils/api/catchAsync');
const employeeService = require('../services/employee/employee.service');
const { 
  createEmployeeSchema, 
  updateEmployeeSchema, 
  deactivateEmployeeSchema,
  getEmployee360Schema,
  inviteUserSchema
} = require('../validation/employee.validation');
const { success, created } = require('../../middleware/responseFormatter');

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

exports.getMyProfile = catchAsync(async (req, res) => {
  const employee = await employeeService.getByUserId(req.user.organizationId, req.user._id);
  return success(res, { employee });
});

exports.createEmployee = catchAsync(async (req, res) => {
  const validatedData = createEmployeeSchema.parse(req.body); 

  // Check if createUser payload was passed alongside
  if (req.body.createUser) {
    validatedData.createUser = req.body.createUser;
  }

  const employee = await employeeService.create(
    req.user.organizationId, 
    validatedData, 
    req.user._id
  );
  
  return created(res, { employee });
});

exports.updateEmployee = catchAsync(async (req, res) => {
  const validatedData = updateEmployeeSchema.parse(req.body);

  const employee = await employeeService.update(
    req.user.organizationId, 
    req.params.id, 
    validatedData, 
    req.user._id
  );
  
  return success(res, { employee });
});

exports.inviteUserForEmployee = catchAsync(async (req, res) => {
  const validatedData = inviteUserSchema.parse(req.body);

  const employee = await employeeService.inviteUser(
    req.user.organizationId,
    req.params.id,
    validatedData,
    req.user._id
  );

  return success(res, { 
    employee, 
    message: 'User account provisioned and linked to employee.' 
  });
});

exports.deactivateEmployee = catchAsync(async (req, res) => {
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

exports.getEmployeeWorkspace = catchAsync(async (req, res) => {
  const { id } = getEmployee360Schema.parse(req.params);

  const workspace = await employeeService.getWorkspace360(
    req.user.organizationId, 
    id, 
    req.user
  );
  
  return success(res, workspace);
});
