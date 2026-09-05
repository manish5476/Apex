const CompanyAsset = require('../../models/companyAsset.model');
const ApiFeatures = require('../../../../../core/utils/api/ApiFeatures');
require('../../../../auth/core/user.model');
require('../../models/employee.model');
require('../../../../organization/core/branch.model');

class CompanyAssetRepository {
  async getList(orgId, queryString) {
    const features = new ApiFeatures(CompanyAsset.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['assetCode', 'name', 'serialNumber', 'manufacturer', 'model'])
      .sort()
      .limitFields()
      .paginate()
      .populate([
        { path: 'assignedTo', select: 'name email avatar' },
        { path: 'employeeRef', select: 'employeeId firstName lastName displayName officialEmail' },
        { path: 'branchId', select: 'name' }
      ]);
    return await features.execute();
  }

  async getById(orgId, id) {
    return CompanyAsset.findOne({ _id: id, organizationId: orgId })
      .populate('assignedTo', 'name email avatar')
      .populate('employeeRef', 'employeeId firstName lastName displayName officialEmail')
      .populate('assignmentHistory.user', 'name email')
      .populate('assignmentHistory.employeeRef', 'employeeId displayName')
      .populate('assignmentHistory.processedBy', 'name');
  }

  async create(orgId, payload) {
    return CompanyAsset.create({ ...payload, organizationId: orgId });
  }

  async updateById(orgId, id, payload, session = null) {
    return CompanyAsset.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: payload },
      { new: true, runValidators: true, session }
    );
  }
}
module.exports = new CompanyAssetRepository();