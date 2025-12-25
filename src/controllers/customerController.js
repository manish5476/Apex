const Customer = require('../models/customerModel');
const Invoice = require('../models/invoiceModel'); // ✅ Added for Integrity Check
const factory = require('../utils/handlerFactory');
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const imageUploadService = require("../services/uploads/imageUploadService");

// PATCH /v1/customers/:id/credit-limit
exports.updateCreditLimit = catchAsync(async (req, res, next) => {
  const { creditLimit } = req.body;
  if (typeof creditLimit !== "number") return next(new AppError("creditLimit must be a number", 400));
  
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { creditLimit },
    { new: true, runValidators: true }
  );
  if (!customer) return next(new AppError("Customer not found", 404));
  res.status(200).json({ status: "success", data: { customer } });
});

// ======================================================
// DELETE CUSTOMER (Safeguarded)
// ======================================================
exports.deleteCustomer = catchAsync(async (req, res, next) => {
  const customerId = req.params.id;
  const orgId = req.user.organizationId;

  // 1. Check for Active Invoices
  // We cannot delete a customer if they have invoices that are NOT cancelled.
  const hasInvoices = await Invoice.exists({
      customerId: customerId,
      organizationId: orgId,
      status: { $ne: 'cancelled' }
  });

  if (hasInvoices) {
      return next(new AppError(
          "CANNOT DELETE: This customer has active Invoices in the system. \n" +
          "-> Action: Mark the customer as 'Inactive' instead, or cancel all their invoices first.",
          409 // Conflict
      ));
  }

  // 2. Check for Outstanding Balance (Financial Safety)
  const customer = await Customer.findOne({ _id: customerId, organizationId: orgId });
  if (!customer) return next(new AppError("Customer not found", 404));

  if (Math.abs(customer.outstandingBalance) > 1) { // Tolerate < 1 floating point diff
      return next(new AppError(
          `CANNOT DELETE: This customer has a balance of ₹${customer.outstandingBalance}. \n` +
          "-> You must settle the payment or write it off before deleting.",
          409
      ));
  }

  // 3. Safe Soft Delete
  customer.isDeleted = true;
  customer.isActive = false;
  await customer.save();

  res.status(200).json({ status: "success", message: "Customer deleted successfully." });
});

exports.createCustomer = factory.createOne(Customer);
exports.getAllCustomers = factory.getAll(Customer);
exports.getCustomer = factory.getOne(Customer);
exports.updateCustomer = factory.updateOne(Customer);
exports.restoreCustomer = factory.restoreOne(Customer);
exports.createBulkCustomer = factory.bulkCreate(Customer);

// ======================================================
// SEARCH CUSTOMERS
// ======================================================
exports.searchCustomers = catchAsync(async (req, res, next) => {
  const q = req.query.q || "";
  const orgId = req.user.organizationId;

  const customers = await Customer.find({
    organizationId: orgId,
    $or: [
      { name: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
      { gstNumber: { $regex: q, $options: "i" } },
    ],
  }).limit(20);

  res.status(200).json({
    status: "success",
    results: customers.length,
    data: { customers },
  });
});

// ======================================================
// BULK UPDATE
// ======================================================
exports.bulkUpdateCustomers = catchAsync(async (req, res, next) => {
  const updates = req.body;
  if (!Array.isArray(updates) || updates.length === 0) { return next(new AppError("Provide an array of customer updates.", 400)); }
  const orgId = req.user.organizationId;
  const operations = updates.map((c) => ({
    updateOne: {
      filter: { _id: c._id, organizationId: orgId },
      update: { $set: c.update },
    },
  }));
  await Customer.bulkWrite(operations);
  res.status(200).json({ status: "success", message: "Bulk update complete" });
});

// ======================================================
// UPLOAD PHOTO
// ======================================================
exports.uploadCustomerPhoto = catchAsync(async (req, res, next) => {
  const customerId = req.params.id;
  if (!req.file || !req.file.buffer) {
    return next(new AppError("Please upload an image file.", 400));
  }
  const folder = `customers/${req.user.organizationId}`;
  const uploadResult = await imageUploadService.uploadImage(req.file.buffer, folder);
  const customer = await Customer.findOneAndUpdate(
    { _id: customerId, organizationId: req.user.organizationId },
    { avatar: uploadResult.url },
    { new: true }
  );

  if (!customer) return next(new AppError("Customer not found.", 404));
  res.status(200).json({ status: "success", message: "Customer photo updated", data: { customer } });
});

// ======================================================
// CHECK DUPLICATE
// ======================================================
exports.checkDuplicate = catchAsync(async (req, res, next) => {
  const { email, phone, name } = req.query;
  const orgId = req.user.organizationId;

  const query = { organizationId: orgId, $or: [] };
  if (email) query.$or.push({ email: email });
  if (phone) query.$or.push({ phone: phone });
  if (name) query.$or.push({ name: { $regex: `^${name}$`, $options: 'i' } });

  if (query.$or.length === 0) {
    return res.status(200).json({ status: "success", isDuplicate: false });
  }

  const existing = await Customer.findOne(query).select("name email phone");
  res.status(200).json({
    status: "success",
    isDuplicate: !!existing,
    existingCustomer: existing || null
  });
});
