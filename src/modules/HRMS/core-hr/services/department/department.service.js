const departmentRepository = require('../../repository/department/department.repository');
const User = require('../../../../auth/core/user.model'); // Adjust path as needed
const Employee = require('../../models/employee.model');
const AppError = require('../../../../../core/utils/api/appError');

class DepartmentService {
  
  async _validateDepartment(orgId, payload, currentId = null) {
    // 1. Check Name/Code Uniqueness
    if (payload.name || payload.code) {
      const exists = await departmentRepository.getByNameOrCode(orgId, payload.name, payload.code, currentId);
      if (exists) {
        if (exists.name === payload.name) throw new AppError('Department name already exists', 400);
        if (exists.code === payload.code) throw new AppError('Department code already exists', 400);
      }
    }

    // 2. Circular Reference & Parent Validation
    if (payload.parentDepartment) {
      const parent = await departmentRepository.getById(orgId, payload.parentDepartment);
      if (!parent) throw new AppError('Parent department not found', 404);

      if (currentId) {
        // Prevent setting parent to a department that is currently a child/descendant
        const escapedId = currentId.toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const circularRegex = new RegExp(`(?:^|/)${escapedId}(?:/|$)`);
        
        if (parent.path && circularRegex.test(parent.path)) {
          throw new AppError('Circular reference detected: Cannot set a descendant as a parent.', 400);
        }
      }
    }

    // 3. HOD Validation
    if (payload.headOfDepartment) {
      const hod = await User.findOne({ _id: payload.headOfDepartment, organizationId: orgId, isActive: true });
      if (!hod) throw new AppError('Head of Department user not found or inactive', 400);
    }
  }

  async getList(orgId, query) {
    return departmentRepository.getList(orgId, query);
  }

  async getTreeHierarchy(orgId) {
    const departments = await departmentRepository.getAllActive(orgId);
    
    // In-memory O(N) Tree Construction
    const buildTree = (parentId = null) => {
      return departments
        .filter(d => 
          parentId === null 
            ? !d.parentDepartment 
            : d.parentDepartment?.toString() === parentId.toString()
        )
        .map(d => ({
          ...d,
          children: buildTree(d._id)
        }));
    };

    return buildTree();
  }

  async getById(orgId, id) {
    const department = await departmentRepository.getById(orgId, id);
    if (!department) throw new AppError('Department not found', 404);
    return department;
  }

  async create(orgId, payload, actorId) {
    await this._validateDepartment(orgId, payload);
    
    payload.createdBy = actorId;
    payload.updatedBy = actorId;
    
    return departmentRepository.create(orgId, payload);
  }

  async update(orgId, id, payload, actorId) {
    await this._validateDepartment(orgId, payload, id);
    
    payload.updatedBy = actorId;
    const department = await departmentRepository.updateById(orgId, id, payload);
    if (!department) throw new AppError('Department not found', 404);
    
    return department;
  }

  async delete(orgId, id, actorId) {
    const department = await this.getById(orgId, id);
    
    // 1. Check if department has active employees
    const employeeCount = await Employee.countDocuments({ organizationId: orgId, departmentId: id });
    if (employeeCount > 0) {
      throw new AppError(`Cannot delete department with ${employeeCount} active employees. Please reassign them first.`, 400);
    }

    // 2. Check if department has child departments
    if (department.path) {
      const childCount = await departmentRepository.countDescendants(orgId, department.path);
      if (childCount > 0) {
        throw new AppError('Cannot delete a department that has active child departments.', 400);
      }
    }

    // Soft delete
    return departmentRepository.updateById(orgId, id, { isActive: false, updatedBy: actorId });
  }

  async getStats(orgId) {
    const stats = await departmentRepository.getStatsAggregation(orgId);
    return stats[0] || { totalDepartments: 0, totalEmployees: 0, departments: [] };
  }

  async getDepartmentEmployees(orgId, departmentId, query) {
    const department = await this.getById(orgId, departmentId);
    
    const page  = Math.max(1, parseInt(query.page)  || 1);
    const limit = Math.min(100, parseInt(query.limit) || 20);
    const skip  = (page - 1) * limit;

    let departmentIds = [department._id];

    if (query.includeSubDepts === 'true' && department.path) {
      const escapedPath = department.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const Department = require('../../models/department.model');
      const descendants = await Department.find({
        organizationId: orgId,
        path: new RegExp(`^${escapedPath}/`),
      }).select('_id');
      departmentIds = [...departmentIds, ...descendants.map(d => d._id)];
    }

    const filter = {
      organizationId: orgId,
      departmentId:   { $in: departmentIds },
    };

    const [employees, total] = await Promise.all([
      Employee.find(filter)
        .select('user departmentId designationId employmentType')
        .populate('user', 'name email phone avatar status isActive')
        .populate('designationId', 'title grade')
        .skip(skip).limit(limit).sort({ createdAt: -1 }),
      Employee.countDocuments(filter),
    ]);

    return {
      employees,
      pagination: { total, page, totalPages: Math.ceil(total / limit) }
    };
  }

  async bulkUpdate(orgId, operations, actorId) {
    if (!Array.isArray(operations)) throw new AppError('Operations must be an array', 400);

    const mongoose = require('mongoose');
    const Department = require('../../models/department.model');
    const ALLOWED_UPDATE_FIELDS = ['name', 'code', 'description', 'headOfDepartment', 'assistantHOD',
      'branchId', 'costCenter', 'budgetCode', 'maxStrength', 'contactEmail', 'contactPhone', 'location', 'isActive'];

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const results = [];

      for (const op of operations) {
        if (op.action === 'create') {
          op.data.organizationId = orgId;
          op.data.createdBy      = actorId;
          op.data.updatedBy      = actorId;
          const dept = await Department.create([op.data], { session });
          results.push({ action: 'create', data: dept[0] });

        } else if (op.action === 'update' && op.id) {
          const safeData = {};
          ALLOWED_UPDATE_FIELDS.forEach(f => { if (op.data[f] !== undefined) safeData[f] = op.data[f]; });
          const dept = await Department.findOneAndUpdate(
            { _id: op.id, organizationId: orgId },
            { $set: { ...safeData, updatedBy: actorId } },
            { new: true, session }
          );
          results.push({ action: 'update', id: op.id, data: dept });

        } else if (op.action === 'delete' && op.id) {
          await Department.findOneAndUpdate(
            { _id: op.id, organizationId: orgId },
            { $set: { isActive: false, updatedBy: actorId } },
            { session }
          );
          results.push({ action: 'delete', id: op.id });
        }
      }

      await session.commitTransaction();
      return results;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new DepartmentService();