'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
const employeeRepository = require('../../repository/employee/employee.repository');
const User = require('../../../../auth/core/user.model');
const Department = require('../../models/department.model');
const Designation = require('../../models/designation.model');
const Branch = require('../../../../organization/core/branch.model');
const Shift = require('../../../attendance/models/shift.model');
const CompanyAsset = require('../../models/companyAsset.model');
const AppError = require('../../../../../core/utils/api/appError');

class EmployeeService {
  
  // Internal helper to validate foreign keys and tenant isolation before creation/update
  async _validateReferences(orgId, payload, excludeEmployeeId = null) {
    const checks = [];

    if (payload.user) {
      checks.push(
        User.findOne({ _id: payload.user, organizationId: orgId })
          .select('_id')
          .lean()
          .then(ok => ['User', ok])
      );

      // Check if user is already linked to another employee in this organization
      const linkFilter = { user: payload.user, organizationId: orgId };
      if (excludeEmployeeId) {
        linkFilter._id = { $ne: excludeEmployeeId };
      }
      const existingLink = await employeeRepository.getByUserId(orgId, payload.user);
      if (existingLink && (!excludeEmployeeId || existingLink._id.toString() !== excludeEmployeeId.toString())) {
        throw new AppError('This user account is already linked to another employee record in this organization.', 400);
      }
    }

    if (payload.branchId) checks.push(Branch.exists({ _id: payload.branchId, organizationId: orgId }).then(ok => ['Branch', ok]));
    if (payload.departmentId) checks.push(Department.exists({ _id: payload.departmentId, organizationId: orgId }).then(ok => ['Department', ok]));
    if (payload.designationId) checks.push(Designation.exists({ _id: payload.designationId, organizationId: orgId }).then(ok => ['Designation', ok]));
    if (payload.reportingManagerId) checks.push(User.exists({ _id: payload.reportingManagerId, organizationId: orgId }).then(ok => ['Reporting Manager', ok]));
    if (payload.attendanceConfig?.shiftId) checks.push(Shift.exists({ _id: payload.attendanceConfig.shiftId, organizationId: orgId }).then(ok => ['Shift', ok]));

    const results = await Promise.all(checks);
    const invalid = results.find(([, ok]) => !ok);
    if (invalid) throw new AppError(`Invalid ${invalid[0]} ID provided for this organization.`, 400);
  }

  async getList(orgId, query) {
    return employeeRepository.getEmployeeList(orgId, query);
  }

  async getById(orgId, id) {
    const employee = await employeeRepository.getById(orgId, id);
    if (!employee) throw new AppError('Employee not found', 404);
    return employee;
  }

  async getByUserId(orgId, userId) {
    const employee = await employeeRepository.getByUserId(orgId, userId);
    if (!employee) throw new AppError('Employee not found for this user', 404);
    return employee;
  }

  async create(orgId, payload, actorId) {
    // 1. If payload requested inline user creation, orchestrate Auth User provisioning
    if (payload.createUser && typeof payload.createUser === 'object') {
      const { name, email, phone, roleId } = payload.createUser;
      if (!name || !email || !phone) {
        throw new AppError('Name, email, and phone are required to provision a login account.', 400);
      }

      // Check if email already exists in system
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new AppError('A user with this email address already exists. Please choose "Link Existing User" instead.', 400);
      }

      const tempPassword = crypto.randomBytes(8).toString('hex') + '!Aa1';
      const [newUser] = await User.create([{
        name,
        email: email.toLowerCase(),
        phone,
        password: tempPassword,
        passwordConfirm: tempPassword,
        role: roleId || undefined,
        organizationId: orgId,
        branchId: payload.branchId || undefined,
        status: 'approved',
        isActive: true,
        mustChangePassword: true
      }]);

      payload.user = newUser._id;
      delete payload.createUser;
    }

    // 2. Validate references
    await this._validateReferences(orgId, payload);
    
    payload.createdBy = actorId;
    payload.updatedBy = actorId;
    
    return employeeRepository.create(orgId, payload);
  }

  async update(orgId, id, payload, actorId) {
    await this._validateReferences(orgId, payload, id);
    
    payload.updatedBy = actorId;
    
    const employee = await employeeRepository.updateById(orgId, id, payload);
    if (!employee) throw new AppError('Employee not found', 404);
    
    return employee;
  }

  async inviteUser(orgId, employeeId, inviteData, actorId) {
    const employee = await employeeRepository.getById(orgId, employeeId);
    if (!employee) throw new AppError('Employee not found', 404);
    if (employee.user) throw new AppError('This employee already has a linked user account.', 400);

    const { name, email, phone, roleId } = inviteData;
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (existingUser.organizationId.toString() !== orgId.toString()) {
        throw new AppError('Email belongs to another organization.', 400);
      }
      // Check if already linked to another employee
      const alreadyLinked = await employeeRepository.getByUserId(orgId, existingUser._id);
      if (alreadyLinked) throw new AppError('This user is already linked to another employee.', 400);

      employee.user = existingUser._id;
      employee.updatedBy = actorId;
      await employee.save();
      return employee;
    }

    const tempPassword = crypto.randomBytes(8).toString('hex') + '!Aa1';
    const [newUser] = await User.create([{
      name: name || employee.displayName,
      email: email.toLowerCase(),
      phone: phone || employee.phone,
      password: tempPassword,
      passwordConfirm: tempPassword,
      role: roleId || undefined,
      organizationId: orgId,
      branchId: employee.branchId || undefined,
      status: 'approved',
      isActive: true,
      mustChangePassword: true
    }]);

    employee.user = newUser._id;
    employee.updatedBy = actorId;
    await employee.save();

    return employee;
  }

  async deactivate(orgId, employeeId, payload, actorId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Deactivate Employee
      const updateData = {
        status: payload.status || 'relieved',
        dateOfExit: payload.dateOfExit || new Date(),
        exitReason: payload.exitReason,
        updatedBy: actorId
      };
      
      const employee = await employeeRepository.updateById(orgId, employeeId, updateData, session);
      if (!employee) throw new AppError('Employee not found', 404);

      // 2. Disable User Login Access if requested and user exists
      if (payload.disableLoginAccess !== false && employee.user) {
        const userId = employee.user._id || employee.user;
        await User.findOneAndUpdate(
          { _id: userId, organizationId: orgId },
          { isActive: false, status: 'inactive' },
          { session }
        );
      }

      // 3. Mark all assigned assets as returned
      if (employee.user) {
        const userId = employee.user._id || employee.user;
        const activeAssets = await CompanyAsset.find({ assignedTo: userId, status: 'assigned' }).session(session);
        for (const asset of activeAssets) {
          await asset.markReturned(actorId, 'good', `Auto-returned during employee offboarding. Reason: ${payload.exitReason}`);
        }
      }

      await session.commitTransaction();
      return employee;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getWorkspace360(orgId, employeeId, requestingUser) {
    const workspaceData = await employeeRepository.getEmployee360Workspace(orgId, employeeId);
    if (!workspaceData) {
      throw new AppError('Employee workspace not found', 404);
    }
    return workspaceData;
  }
}

module.exports = new EmployeeService();