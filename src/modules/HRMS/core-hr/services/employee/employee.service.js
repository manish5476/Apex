const mongoose = require('mongoose');
const employeeRepository = require('./employee.repository');
const User = require('../../auth/core/user.model');
const Department = require('../../core-hr/models/department.model');
const Designation = require('../../core-hr/models/designation.model');
const Branch = require('../../../organization/core/branch.model');
const Shift = require('../../attendance/models/shift.model');
const CompanyAsset = require('../../core-hr/models/companyAsset.model');
const AppError = require('../../core/utils/api/appError');

class EmployeeService {
  
  // Internal helper to validate foreign keys before creation/update
  async _validateReferences(orgId, payload) {
    const checks = [];

    if (payload.user) checks.push(User.exists({ _id: payload.user, organizationId: orgId }).then(ok => ['User', ok]));
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
    await this._validateReferences(orgId, payload);
    
    payload.createdBy = actorId;
    payload.updatedBy = actorId;
    
    return employeeRepository.create(orgId, payload);
  }

  async update(orgId, id, payload, actorId) {
    await this._validateReferences(orgId, payload);
    
    payload.updatedBy = actorId;
    
    const employee = await employeeRepository.updateById(orgId, id, payload);
    if (!employee) throw new AppError('Employee not found', 404);
    
    return employee;
  }

  async deactivate(orgId, employeeId, payload, actorId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Deactivate Employee
      payload.isActive = false;
      payload.updatedBy = actorId;
      const employee = await employeeRepository.updateById(orgId, employeeId, payload, session);
      if (!employee) throw new AppError('Employee not found', 404);

      // 2. Deactivate User Account
      await User.findOneAndUpdate(
        { _id: employee.user, organizationId: orgId },
        { isActive: false, status: 'inactive' },
        { session }
      );

      // 3. Mark all assigned assets as returned
      const activeAssets = await CompanyAsset.find({ assignedTo: employee.user, status: 'assigned' }).session(session);
      for (const asset of activeAssets) {
        await asset.markReturned(actorId, 'good', `Auto-returned during offboarding. Reason: ${payload.exitReason}`);
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
  // Execute the ultra-fast aggregation
  const workspaceData = await employeeRepository.getEmployee360Workspace(orgId, employeeId);
  
  if (!workspaceData) {
    throw new AppError('Employee workspace not found', 404);
  }

  // Dynamic Compliance Calculation
  const total = workspaceData.compliance.totalDocuments;
  const verified = workspaceData.compliance.verifiedDocuments;
  workspaceData.compliance.completionPercentage = total > 0 ? Math.round((verified / total) * 100) : 0;

  // Optional: Mask sensitive fields if the requestingUser is not HR/Admin
  // if (requestingUser.role !== 'admin' && requestingUser._id !== workspaceData.identity.id) {
  //   delete workspaceData.documents;
  // }

  return workspaceData;
}
}
module.exports = new EmployeeService();


// const mongoose = require('mongoose');
// const employeeRepository = require('./employee.repository');
// const User = require('../../auth/core/user.model');
// const CompanyAsset = require('../../core-hr/models/companyAsset.model');
// const AppError = require('../../core/utils/api/appError');

// class EmployeeService {
  
//   async getList(orgId, query) {
//     return employeeRepository.getEmployeeList(orgId, query);
//   }

//   async deactivate(orgId, employeeId, payload, actorId) {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       // 1. Deactivate Employee
//       const employee = await employeeRepository.updateById(orgId, employeeId, {
//         status: payload.status || 'inactive',
//         dateOfExit: payload.dateOfExit || new Date(),
//         exitReason: payload.exitReason,
//         isActive: false,
//         updatedBy: actorId
//       }, session);

//       if (!employee) throw new AppError('Employee not found', 404);

//       // 2. Deactivate User Account (Block Login)
//       await User.findOneAndUpdate(
//         { _id: employee.user, organizationId: orgId },
//         { isActive: false, status: 'inactive' },
//         { session }
//       );

//       // 3. Release Assigned Assets
//       // Your CompanyAsset schema has a specific markReturned method, 
//       // but methods don't run in updateMany. We must retrieve and update.
//       const activeAssets = await CompanyAsset.find({ 
//         assignedTo: employee.user, 
//         status: 'assigned' 
//       }).session(session);

//       for (const asset of activeAssets) {
//         await asset.markReturned(
//           actorId, 
//           'good', 
//           `Auto-returned during employee deactivation. Reason: ${payload.exitReason}`
//         );
//       }

//       // 4. Future: Cancel pending leaves, disable attendance, etc.
//       // await leaveService.cancelPendingLeaves(orgId, employee.user, session);

//       await session.commitTransaction();
      
//       // 5. Fire Async Events (Outside the transaction)
//       // eventBus.publish('EMPLOYEE_OFFBOARDED', { employeeId: employee._id });

//       return employee;
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }
// }

// module.exports = new EmployeeService();