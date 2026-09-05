'use strict';

const mongoose = require('mongoose');
const SalaryStructure = require('../models/salaryStructure.model');
const Employee = require('../../core-hr/models/employee.model');
const ApiFeatures = require('../../../../core/utils/api/ApiFeatures');
const AppError = require('../../../../core/utils/api/appError');

class SalaryStructureService {
  async getList(orgId, queryString) {
    const filter = { organizationId: orgId };
    if (queryString.user) filter.user = queryString.user;
    if (queryString.employeeId) filter.employeeId = queryString.employeeId;
    if (queryString.status) filter.status = queryString.status;

    const features = new ApiFeatures(SalaryStructure.find(filter), queryString)
      .filter()
      .search(['title', 'structureCode'])
      .sort()
      .limitFields()
      .paginate()
      .populate([
        { path: 'user', select: 'name email avatar' },
        { path: 'employeeId', select: 'employeeId firstName lastName' },
        { path: 'branchId', select: 'name' },
      ]);

    return await features.execute();
  }

  async getById(orgId, id) {
    const structure = await SalaryStructure.findOne({ _id: id, organizationId: orgId })
      .populate('user', 'name email avatar')
      .populate('employeeId', 'employeeId firstName lastName')
      .populate('branchId', 'name');

    if (!structure) throw new AppError('Salary structure not found', 404);
    return structure;
  }

  async create(orgId, payload, actorId) {
    if (!payload.structureCode) {
      payload.structureCode = `STR-${Date.now().toString(36).toUpperCase()}`;
    }

    if (payload.status === 'active' && payload.user) {
      await SalaryStructure.updateMany(
        { organizationId: orgId, user: payload.user, status: 'active' },
        { status: 'superseded', effectiveTo: payload.effectiveFrom || new Date() }
      );
    }

    const structure = await SalaryStructure.create({
      ...payload,
      organizationId: orgId,
      createdBy: actorId,
      updatedBy: actorId,
    });

    if (payload.employeeId) {
      await Employee.findByIdAndUpdate(payload.employeeId, {
        'compensation.salaryStructureId': structure._id,
      });
    }

    return this.getById(orgId, structure._id);
  }

  async update(orgId, id, payload, actorId) {
    const existing = await SalaryStructure.findOne({ _id: id, organizationId: orgId });
    if (!existing) throw new AppError('Salary structure not found', 404);

    if (payload.status === 'active' && existing.status !== 'active') {
      await SalaryStructure.updateMany(
        { organizationId: orgId, user: existing.user, _id: { $ne: id }, status: 'active' },
        { status: 'superseded', effectiveTo: payload.effectiveFrom || new Date() }
      );
    }

    const updated = await SalaryStructure.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { ...payload, updatedBy: actorId },
      { new: true, runValidators: true }
    )
      .populate('user', 'name email avatar')
      .populate('employeeId', 'employeeId firstName lastName');

    return updated;
  }

  async delete(orgId, id) {
    const structure = await SalaryStructure.findOne({ _id: id, organizationId: orgId });
    if (!structure) throw new AppError('Salary structure not found', 404);

    await SalaryStructure.findByIdAndDelete(id);
    return true;
  }
}

module.exports = new SalaryStructureService();