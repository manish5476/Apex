const Customer = require('./customer.model');
const Invoice = require('../../accounting/billing/invoice.model');
const factory = require('../../../core/utils/api/handlerFactory');
const AppError = require('../../../core/utils/api/appError');
const catchAsync = require('../../../core/utils/api/catchAsync');
const imageUploadService = require('../../uploads/imageUploadService');
const ApiFeatures = require('../../../core/utils/api/ApiFeatures');

// ======================================================
// UPDATE CREDIT LIMIT
// PATCH /customers/:id/credit-limit
// ======================================================
exports.updateCreditLimit = catchAsync(async (req, res, next) => {
  const { creditLimit } = req.body;
  if (typeof creditLimit !== 'number')
    return next(new AppError('creditLimit must be a number', 400));
  if (creditLimit < 0)
    return next(new AppError('creditLimit cannot be negative', 400));

  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { creditLimit },
    { new: true, runValidators: true }
  );
  if (!customer) return next(new AppError('Customer not found', 404));

  res.status(200).json({ status: 'success', data: { customer } });
});

// ======================================================
// DELETE CUSTOMER (safeguarded soft delete)
// DELETE /customers/:id
// ======================================================
exports.deleteCustomer = catchAsync(async (req, res, next) => {
  const customerId = req.params.id;
  const orgId = req.user.organizationId;

  // 1. Cannot delete if active invoices exist
  const hasInvoices = await Invoice.exists({
    customerId,
    organizationId: orgId,
    status: { $ne: 'cancelled' },
  });

  if (hasInvoices) {
    return next(new AppError(
      'CANNOT DELETE: This customer has active invoices. ' +
      'Mark them as Inactive instead, or cancel all their invoices first.',
      409
    ));
  }

  const customer = await Customer.findOne({ _id: customerId, organizationId: orgId });
  if (!customer) return next(new AppError('Customer not found', 404));
  if (Math.abs(customer.outstandingBalance) > 1) {
    return next(new AppError(
      `CANNOT DELETE: This customer has a balance of ₹${customer.outstandingBalance}. ` +
      'Settle the payment or write it off before deleting.',
      409
    ));
  }

  customer.isDeleted = true;
  customer.isActive = false;
  await customer.save();
  res.status(200).json({ status: 'success', message: 'Customer deleted successfully.' });
});

// ======================================================
// SEARCH CUSTOMERS
// GET /customers/search?q=...
// ======================================================
exports.searchCustomers = catchAsync(async (req, res, next) => {
  const q = (req.query.q || req.query.search || req.query.query || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const orgId = req.user.organizationId;

  // Always exclude soft-deleted records
  const baseFilter = {
    organizationId: orgId,
    isDeleted: false,
    isActive: true,
  };

  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 8);
  const searchFields = ['name', 'contactPerson', 'phone', 'email', 'gstNumber', 'panNumber'];

  const tokenClauses = tokens.map((token) => ({
    $or: searchFields.flatMap((field) => ApiFeatures.buildFuzzyConditions(field, token)),
  }));

  const filter = tokenClauses.length
    ? { ...baseFilter, $and: tokenClauses }
    : baseFilter;

  const customers = await Customer.find(filter)
    .select('name phone email type avatar outstandingBalance')
    .limit(limit)
    .lean();

  res.status(200).json({
    status: 'success',
    results: customers.length,
    data: { customers },
  });
});

// ======================================================
// BULK UPDATE
// POST /customers/bulk-update
// ======================================================
exports.bulkUpdateCustomers = catchAsync(async (req, res, next) => {
  const updates = req.body;
  if (!Array.isArray(updates) || updates.length === 0)
    return next(new AppError('Provide an array of customer updates.', 400));

  const orgId = req.user.organizationId;

  const operations = updates.map(c => ({
    updateOne: {
      filter: { _id: c._id, organizationId: orgId },
      update: { $set: c.update },
    },
  }));

  const result = await Customer.bulkWrite(operations);

  res.status(200).json({
    status: 'success',
    message: 'Bulk update complete',
    data: { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount },
  });
});

// ======================================================
// UPLOAD CUSTOMER PHOTO
// PATCH /customers/:id/upload
// ======================================================
exports.uploadCustomerPhoto = catchAsync(async (req, res, next) => {
  const customerId = req.params.id;

  if (!req.file || !req.file.buffer)
    return next(new AppError('Please upload an image file.', 400));

  // Pre-check: validate customer before hitting Cloudinary
  const customer = await Customer.findOne({
    _id: customerId,
    organizationId: req.user.organizationId,
  });
  if (!customer) return next(new AppError('Customer not found.', 404));

  // Cleanup: delete old asset to prevent orphaned files
  if (customer.avatarAsset) {
    try {
      await imageUploadService.deleteFullAsset(customer.avatarAsset, req.user.organizationId);
    } catch (err) {
      console.warn('Old customer photo cleanup skipped:', err.message);
    }
  }

  // Upload and record new asset
  const asset = await imageUploadService.uploadAndRecord(req.file, req.user, 'avatar');

  customer.avatar = asset.url;
  customer.avatarAsset = asset._id;
  await customer.save();

  res.status(200).json({
    status: 'success',
    message: 'Customer photo updated successfully.',
    data: { customer, asset },
  });
});

// ======================================================
// CHECK DUPLICATE
// GET /customers/check-duplicate?email=&phone=&name=
// ======================================================
exports.checkDuplicate = catchAsync(async (req, res, next) => {
  const { email, phone, gstNumber, name } = req.query;
  const orgId = req.user.organizationId;

  const orClauses = [];
  if (email) orClauses.push({ email });
  if (phone) orClauses.push({ phone });
  if (gstNumber) orClauses.push({ gstNumber: String(gstNumber).toUpperCase() });
  if (name) orClauses.push({ name: { $regex: `^${name}$`, $options: 'i' } });

  if (orClauses.length === 0)
    return res.status(200).json({ status: 'success', isDuplicate: false });

  const existing = await Customer.findOne({
    organizationId: orgId,
    isDeleted: false,
    $or: orClauses,
  }).select('name email phone');

  res.status(200).json({
    status: 'success',
    isDuplicate: !!existing,
    existingCustomer: existing || null,
  });
});

// ======================================================
// FACTORY DELEGATES
// ======================================================
exports.createCustomer = factory.createOne(Customer);
exports.getAllCustomers = factory.getAll(Customer, {
  searchFields: ['name', 'contactPerson', 'phone', 'email', 'gstNumber', 'panNumber'],
});
exports.getCustomer = factory.getOne(Customer);
exports.updateCustomer = factory.updateOne(Customer);
exports.restoreCustomer = factory.restoreOne(Customer);
exports.createBulkCustomer = factory.bulkCreate(Customer);
