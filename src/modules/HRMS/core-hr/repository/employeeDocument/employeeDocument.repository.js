const EmployeeDocument = require('../../models/employeeDocument.model');
const ApiFeatures = require('../../../../utils/api.utils');

class EmployeeDocumentRepository {
  async getList(orgId, queryString) {
    const features = new ApiFeatures(EmployeeDocument.find({ organizationId: orgId, isDeleted: false }), queryString)
      .filter()
      .search(['title', 'documentNumber'])
      .sort()
      .limitFields()
      .paginate()
      .populate('user', 'name email avatar');
    return await features.execute();
  }

  async getById(orgId, id) {
    // Select documentNumber explicitly since it has `select: false` in schema
    return EmployeeDocument.findOne({ _id: id, organizationId: orgId, isDeleted: false })
      .select('+documentNumber') 
      .populate('user', 'name email')
      .populate('verification.verifiedBy', 'name email');
  }

  async create(orgId, payload) {
    return EmployeeDocument.create({ ...payload, organizationId: orgId });
  }

  async updateById(orgId, id, payload) {
    return EmployeeDocument.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: payload },
      { new: true, runValidators: true }
    );
  }
}
module.exports = new EmployeeDocumentRepository();