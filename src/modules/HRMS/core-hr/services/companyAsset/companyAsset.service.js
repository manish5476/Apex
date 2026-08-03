const assetRepository = require('../../repository/companyAsset/companyAsset.repository');
const User = require('../../../../auth/core/user.model');
const Employee = require('../../models/employee.model');
const AppError = require('../../../../core/utils/api/appError');

class CompanyAssetService {
  async getList(orgId, query) {
    return assetRepository.getList(orgId, query);
  }

  async getById(orgId, id) {
    const asset = await assetRepository.getById(orgId, id);
    if (!asset) throw new AppError('Asset not found', 404);
    return asset;
  }

  async create(orgId, payload, actorId) {
    payload.createdBy = actorId;
    payload.updatedBy = actorId;
    return assetRepository.create(orgId, payload);
  }

  async update(orgId, id, payload, actorId) {
    payload.updatedBy = actorId;
    const asset = await assetRepository.updateById(orgId, id, payload);
    if (!asset) throw new AppError('Asset not found', 404);
    return asset;
  }

  async assignAsset(orgId, assetId, payload, actorId) {
    const asset = await this.getById(orgId, assetId);
    
    // Verify target user and employee exist
    const [userExists, empExists] = await Promise.all([
      User.exists({ _id: payload.userId, organizationId: orgId }),
      Employee.exists({ _id: payload.employeeId, organizationId: orgId })
    ]);

    if (!userExists || !empExists) {
      throw new AppError('Target User or Employee record not found.', 404);
    }

    // Use the Mongoose instance method you built
    try {
      await asset.assignTo(payload.userId, payload.employeeId, actorId, payload.notes);
      return asset;
    } catch (error) {
      throw new AppError(error.message, 400); // Catches the 'Asset cannot be assigned' error
    }
  }

  async returnAsset(orgId, assetId, payload, actorId) {
    const asset = await this.getById(orgId, assetId);
    
    try {
      await asset.markReturned(actorId, payload.conditionOnReturn, payload.notes);
      return asset;
    } catch (error) {
      throw new AppError(error.message, 400);
    }
  }
}
module.exports = new CompanyAssetService();