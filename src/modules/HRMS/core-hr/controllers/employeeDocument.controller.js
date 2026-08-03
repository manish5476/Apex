const catchAsync = require('../../../core/utils/api/catchAsync');
const documentService = require('../services/employeeDocument/employeeDocument.service');
const { uploadDocumentSchema, verifyDocumentSchema } = require('../validation/employeeDocument.validation');
const { success, created, noContent } = require('../../../middleware/responseFormatter');

exports.getAllDocuments = catchAsync(async (req, res) => {
  const result = await documentService.getList(req.user.organizationId, req.query);
  return success(res, result.data, 200, result.pagination);
});

exports.getDocument = catchAsync(async (req, res) => {
  const document = await documentService.getById(req.user.organizationId, req.params.id);
  return success(res, { document });
});

exports.uploadDocument = catchAsync(async (req, res) => {
  // Note: Actual file binary handling (Multer/S3) would happen in a middleware before this.
  // req.body should contain the S3 URL or reference path.
  const data = uploadDocumentSchema.parse(req.body);
  const document = await documentService.upload(req.user.organizationId, data, req.user._id);
  return created(res, { document });
});

exports.verifyDocument = catchAsync(async (req, res) => {
  const data = verifyDocumentSchema.parse(req.body);
  const document = await documentService.verifyDocument(req.user.organizationId, req.params.id, data, req.user._id);
  return success(res, { document, message: `Document marked as ${data.status}` });
});

exports.deleteDocument = catchAsync(async (req, res) => {
  await documentService.delete(req.user.organizationId, req.params.id, req.user._id);
  return noContent(res);
});