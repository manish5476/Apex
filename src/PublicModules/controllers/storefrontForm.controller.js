const StorefrontFormSubmission = require('../models/storefront/storefrontFormSubmission.model');
const Organization = require('../../modules/organization/core/organization.model');
const catchAsync = require('../../core/utils/api/catchAsync');
const AppError = require('../../core/utils/api/appError');
const factory = require('../../core/utils/api/handlerFactory');
const { emitToOrg } = require('../../socketHandlers/socket');

/* ---------------------------------------------------------------
 * PUBLIC: Submit Form from Storefront
 * POST /api/v1/store/:uniqueShopId/forms/submit
 --------------------------------------------------------------- */
exports.submitForm = catchAsync(async (req, res, next) => {
  const { uniqueShopId } = req.params;
  const { formType, visitorName, visitorEmail, visitorPhone, message, metadata } = req.body;

  if (!formType || !visitorEmail) {
    return next(new AppError('formType and visitorEmail are required.', 400));
  }

  // Find organization by shop code
  const org = await Organization.findOne({ uniqueShopId: uniqueShopId.toUpperCase(), isActive: true });
  if (!org) {
    return next(new AppError('Organization not found or inactive.', 404));
  }

  // Create submission
  const submission = await StorefrontFormSubmission.create({
    organizationId: org._id,
    formType,
    visitorName,
    visitorEmail,
    visitorPhone,
    message,
    metadata
  });

  // Notify the organization owner in real-time if socket exists
  if (typeof emitToOrg === 'function') {
    emitToOrg(org._id, 'newFormSubmission', {
      title: `New ${formType} Submission`,
      message: `You received a new submission from ${visitorEmail}.`,
      submissionId: submission._id,
      type: 'info'
    });
  }

  res.status(201).json({
    status: 'success',
    message: 'Form submitted successfully.',
    data: submission
  });
});

/* ---------------------------------------------------------------
 * PROTECTED: Get My Organization's Form Submissions
 * GET /api/v1/store/forms/submissions
 --------------------------------------------------------------- */
exports.getSubmissions = catchAsync(async (req, res, next) => {
  const filter = { organizationId: req.user.organizationId };
  
  if (req.query.formType) filter.formType = req.query.formType;
  if (req.query.status) filter.status = req.query.status;

  const submissions = await StorefrontFormSubmission.find(filter).sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: submissions.length,
    data: { submissions }
  });
});

/* ---------------------------------------------------------------
 * PROTECTED: Update Submission Status
 * PATCH /api/v1/store/forms/submissions/:id
 --------------------------------------------------------------- */
exports.updateSubmissionStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['new', 'read', 'replied'].includes(status)) {
    return next(new AppError('Invalid status value.', 400));
  }

  const submission = await StorefrontFormSubmission.findOneAndUpdate(
    { _id: id, organizationId: req.user.organizationId },
    { status },
    { new: true, runValidators: true }
  );

  if (!submission) {
    return next(new AppError('Submission not found.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { submission }
  });
});

/* ---------------------------------------------------------------
 * PROTECTED: Delete Submission
 * DELETE /api/v1/store/forms/submissions/:id
 --------------------------------------------------------------- */
exports.deleteSubmission = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const submission = await StorefrontFormSubmission.findOneAndDelete({
    _id: id,
    organizationId: req.user.organizationId
  });

  if (!submission) {
    return next(new AppError('Submission not found.', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});
