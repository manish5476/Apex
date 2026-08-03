const departmentRepository = require('../../repository/department/department.repository');
const User = require('../../../../auth/core/user.model'); // Adjust path as needed
const Employee = require('../../models/employee.model');
const AppError = require('../../../../core/utils/api/appError');

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
}

module.exports = new DepartmentService();