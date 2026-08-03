const mongoose = require('mongoose');
const designationRepository = require('../../repository/designation/designation.repository');
const AppError = require('../../../../core/utils/api/appError');

class DesignationService {
  
  async _validateDesignation(orgId, payload, currentId = null, existingDoc = null) {
    // 1. Check Title/Code uniqueness
    if (payload.title || payload.code) {
      const exists = await designationRepository.getByTitleOrCode(orgId, payload.title, payload.code, currentId);
      if (exists) {
        if (exists.title === payload.title) throw new AppError('Designation title already exists', 400);
        if (exists.code === payload.code) throw new AppError('Designation code already exists', 400);
      }
    }

    // 2. Career Path Level Validation
    if (payload.nextDesignation) {
      const next = await designationRepository.getById(orgId, payload.nextDesignation);
      if (!next) throw new AppError('Next designation not found', 400);

      const currentLevel = payload.level ?? existingDoc?.level;
      if (currentLevel !== undefined && next.level <= currentLevel) {
        throw new AppError(`Next designation level (${next.level}) must be strictly higher than current (${currentLevel})`, 400);
      }
    }

    // 3. Reporting Line Validation
    if (payload.reportsTo?.length) {
      const validReportsTo = await designationRepository.getAllActive(orgId);
      const validIds = validReportsTo.map(d => d._id.toString());
      const allExist = payload.reportsTo.every(id => validIds.includes(id));
      if (!allExist) throw new AppError('One or more reporting designations not found', 400);
    }
  }

  async getList(orgId, query) {
    return designationRepository.getList(orgId, query);
  }

  async getById(orgId, id) {
    const designation = await designationRepository.getById(orgId, id);
    if (!designation) throw new AppError('Designation not found', 404);
    return designation;
  }

  async create(orgId, payload, actorId) {
    await this._validateDesignation(orgId, payload);
    payload.createdBy = actorId;
    payload.updatedBy = actorId;
    return designationRepository.create(orgId, payload);
  }

  async update(orgId, id, payload, actorId) {
    const existing = await this.getById(orgId, id);
    await this._validateDesignation(orgId, payload, id, existing);
    
    payload.updatedBy = actorId;
    return designationRepository.updateById(orgId, id, payload);
  }

  async delete(orgId, id, actorId) {
    const { employeeCount, nextDesigCount } = await designationRepository.isReferenced(orgId, id);
    
    if (employeeCount > 0) throw new AppError(`Cannot delete designation assigned to ${employeeCount} active employees.`, 400);
    if (nextDesigCount > 0) throw new AppError('Cannot delete: this role is referenced as a next step in a career path.', 400);

    return designationRepository.updateById(orgId, id, { isActive: false, updatedBy: actorId });
  }

  async getCareerPath(orgId, startId) {
    const startDesignation = await this.getById(orgId, startId);
    
    // Fetch all to avoid N+1 queries during path traversal
    const allDesignations = await designationRepository.getAllActive(orgId);
    const designationMap = new Map(allDesignations.map(d => [d._id.toString(), d]));

    const careerPath = [];
    const visited = new Set();
    const MAX_LEVELS = 20;
    
    let current = designationMap.get(startDesignation._id.toString());

    // Traverse the path with Circular Reference protection
    while (current && careerPath.length <= MAX_LEVELS) {
      const idStr = current._id.toString();
      if (visited.has(idStr)) break; // Circular loop detected, break safely
      visited.add(idStr);

      careerPath.push({
        _id: current._id,
        title: current.title,
        code: current.code,
        level: current.level,
        grade: current.grade,
        salaryBand: current.salaryBand,
        promotionAfterYears: current.promotionAfterYears
      });

      current = current.nextDesignation ? designationMap.get(current.nextDesignation.toString()) : null;
    }

    const lateralMoves = allDesignations.filter(
      d => d.level === startDesignation.level && d._id.toString() !== startDesignation._id.toString()
    );

    return {
      current: startDesignation,
      careerPath: careerPath.slice(1), // Remove self from path
      lateralMoves
    };
  }

  async getPromotionEligible(orgId, designationId, manualYearsOverride) {
    const designation = await this.getById(orgId, designationId);
    
    const yearsRequired = manualYearsOverride 
      ? Math.max(0, parseInt(manualYearsOverride)) 
      : designation.promotionAfterYears;

    if (!yearsRequired) return { eligibleCount: 0, employees: [] };

    // Leap-year safe date calculation
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - yearsRequired);

    const employees = await designationRepository.getEligibleEmployees(orgId, designation._id, cutoff);
    
    let nextDesignation = null;
    if (designation.nextDesignation) {
      nextDesignation = await designationRepository.getById(orgId, designation.nextDesignation);
    }

    return {
      currentDesignation: designation,
      nextDesignation: nextDesignation ? { title: nextDesignation.title, level: nextDesignation.level } : null,
      eligibleCount: employees.length,
      employees
    };
  }

  async getSalaryBands(orgId) {
    return designationRepository.getSalaryBandsAggregation(orgId);
  }
}

module.exports = new DesignationService();