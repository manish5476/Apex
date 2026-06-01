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

  // ⚠️  Cautionary flag — not a block. Operator may proceed.
  const noGuarantorWarning =
    creditLimit > 0 && (!customer.guarantors || customer.guarantors.length === 0);

  res.status(200).json({
    status: 'success',
    ...(noGuarantorWarning && {
      warning: 'This customer has a credit limit but no guarantors on record. Consider adding a guarantor for security.',
    }),
    data: { customer },
  });
});

// ======================================================
// GET CUSTOMERS GUARANTEED BY THIS CUSTOMER
// GET /customers/:id/guaranteed-customers
// Returns all customers for whom this customer is a guarantor,
// along with their purchase history, outstanding balance, and status.
// Guarantor's own isActive status is also included so stale/deactivated
// guarantors are clearly visible in the response.
// ======================================================
exports.getGuaranteedCustomers = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const guarantorId = req.params.id;

  // Verify the guarantor customer actually belongs to this org
  const guarantorExists = await Customer.exists({ _id: guarantorId, organizationId: orgId });
  if (!guarantorExists) return next(new AppError('Guarantor customer not found', 404));

  // Find all customers in this org who list this customer as one of their guarantors
  const guaranteedCustomers = await Customer.find({
    organizationId: orgId,
    isDeleted: false,
    'guarantors.customerId': guarantorId,
  })
    .select(
      'name phone email type avatar ' +
      'outstandingBalance creditLimit totalPurchases invoiceCount ' +
      'lastPurchaseDate lastInvoiceAmount isActive tags guarantors'
    )
    .lean();

  // Slim down the guarantors array to only the entry for this specific guarantor
  // (a customer can have multiple guarantors; we surface just the relevant one)
  const result = guaranteedCustomers.map(c => {
    const entry = c.guarantors.find(
      g => String(g.customerId) === String(guarantorId)
    );
    return {
      ...c,
      guarantorEntry: entry || null, // notes + addedAt for this specific guarantor
      guarantors: undefined,         // strip full array from payload
    };
  });

  res.status(200).json({
    status: 'success',
    results: result.length,
    data: { guaranteedCustomers: result },
  });
});

// ======================================================
// GET SINGLE CUSTOMER WITH POPULATED GUARANTORS
// GET /customers/:id/with-guarantors
// Same as getOne but also populates name, phone, isActive
// for every guarantor so the UI can show deactivated badges.
// ======================================================
exports.getCustomerWithGuarantors = catchAsync(async (req, res, next) => {
  const customer = await Customer.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  })
    .populate({
      path: 'guarantors.customerId',
      select: 'name phone email avatar isActive isDeleted',
    })
    .populate('createdBy', 'name')
    .lean();

  if (!customer) return next(new AppError('Customer not found', 404));

  // Emit warning if credit limit > 0 but no guarantors set
  const noGuarantorWarning =
    (customer.creditLimit || 0) > 0 &&
    (!customer.guarantors || customer.guarantors.length === 0);

  res.status(200).json({
    status: 'success',
    ...(noGuarantorWarning && {
      warning: 'This customer has a credit limit but no guarantors on record. Consider adding a guarantor for security.',
    }),
    data: { customer },
  });
});

// ======================================================
// ADD A GUARANTOR
// POST /customers/:id/guarantors
// Body: { guarantorId, notes }
// ======================================================
exports.addGuarantor = catchAsync(async (req, res, next) => {
  const { guarantorId, notes } = req.body;
  const orgId = req.user.organizationId;
  const customerId = req.params.id;

  if (!guarantorId)
    return next(new AppError('guarantorId is required', 400));

  // Guard: cannot guarantee yourself
  if (String(guarantorId) === String(customerId))
    return next(new AppError('A customer cannot be their own guarantor', 400));

  // Guard: guarantor must exist in the same org
  const guarantor = await Customer.findOne({
    _id: guarantorId,
    organizationId: orgId,
    isDeleted: false,
  }).select('name isActive');

  if (!guarantor)
    return next(new AppError('Guarantor customer not found in this organisation', 404));

  // Guard: prevent duplicate entries
  const customer = await Customer.findOne({ _id: customerId, organizationId: orgId });
  if (!customer) return next(new AppError('Customer not found', 404));

  const alreadyAdded = customer.guarantors.some(
    g => String(g.customerId) === String(guarantorId)
  );
  if (alreadyAdded)
    return next(new AppError('This customer is already listed as a guarantor', 409));

  customer.guarantors.push({
    customerId: guarantorId,
    notes: notes || null,
    addedAt: new Date(),
    addedBy: req.user._id,
  });

  await customer.save();

  res.status(200).json({
    status: 'success',
    message: `${guarantor.name} has been added as a guarantor.`,
    data: { customer },
  });
});

// ======================================================
// REMOVE A GUARANTOR
// DELETE /customers/:id/guarantors/:guarantorId
// ======================================================
exports.removeGuarantor = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { id: customerId, guarantorId } = req.params;

  const customer = await Customer.findOne({ _id: customerId, organizationId: orgId });
  if (!customer) return next(new AppError('Customer not found', 404));

  const before = customer.guarantors.length;
  customer.guarantors = customer.guarantors.filter(
    g => String(g.customerId) !== String(guarantorId)
  );

  if (customer.guarantors.length === before)
    return next(new AppError('Guarantor not found on this customer', 404));

  await customer.save();

  res.status(200).json({
    status: 'success',
    message: 'Guarantor removed successfully.',
    data: { customer },
  });
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
