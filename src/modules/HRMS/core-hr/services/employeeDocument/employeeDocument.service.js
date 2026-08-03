const documentRepository = require('../../repository/employeeDocument/employeeDocument.repository');
const AppError = require('../../../../core/utils/api/appError');

class EmployeeDocumentService {
  async getList(orgId, query) {
    return documentRepository.getList(orgId, query);
  }

  async getById(orgId, id) {
    const doc = await documentRepository.getById(orgId, id);
    if (!doc) throw new AppError('Document not found', 404);
    return doc;
  }

  async upload(orgId, payload, actorId) {
    payload.uploadedBy = actorId;
    payload.createdBy = actorId;
    payload.updatedBy = actorId;
    
    // Set initial verification state
    payload.verification = { status: 'pending' };

    return documentRepository.create(orgId, payload);
  }

  async verifyDocument(orgId, docId, payload, actorId) {
    const doc = await this.getById(orgId, docId);

    const verificationUpdate = {
      'verification.status': payload.status,
      'verification.verifiedBy': actorId,
      'verification.verifiedAt': new Date(),
    };

    if (payload.status === 'rejected') {
      verificationUpdate['verification.rejectionReason'] = payload.rejectionReason;
    }
    if (payload.expiresAt) {
      verificationUpdate['verification.expiresAt'] = payload.expiresAt;
    }

    return documentRepository.updateById(orgId, docId, verificationUpdate);
  }

  async delete(orgId, id, actorId) {
    const doc = await this.getById(orgId, id);
    // Soft delete implementation
    return documentRepository.updateById(orgId, id, { 
      isDeleted: true, 
      isActive: false,
      updatedBy: actorId 
    });
  }
}
module.exports = new EmployeeDocumentService();