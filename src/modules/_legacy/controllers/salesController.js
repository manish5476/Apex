const Sales = require('../models/salesModel'); // Assuming the model name
const SalesService = require('../services/salesService');
const factory = require('../utils/handlerFactory');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { createSalesSchema, updateSalesSchema } = require('../validations/salesValidation');

/**
 * Common Populate Configuration for Sales
 */
const salesPopulate = [
  { path: 'customerId', select: 'name phone email' },
  { path: 'invoiceId', select: 'invoiceNumber grandTotal status' },
  { path: 'branchId', select: 'name code' },
  { path: 'items.productId', select: 'name sku' }
];

/**
 * CREATE SALE
 * Uses custom logic to handle validation before passing to Factory-like behavior
 */
exports.createSales = catchAsync(async (req, res, next) => {
  // 1. Validate User Input
  const { error, value } = createSalesSchema.validate(req.body);
  if (error) return next(new AppError(error.message, 400));

  // 2. Inject System Fields
  req.body = {
    ...value,
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
    createdBy: req.user.id
  };

  // 3. Use Service for creation (to handle inventory/ledger logic)
  const doc = await SalesService.create(req.body);

  res.status(201).json({
    status: 'success',
    data: { data: doc }
  });
});

/**
 * CREATE FROM INVOICE
 * Specialized logic that doesn't fit standard CRUD
 */
exports.createFromInvoice = catchAsync(async (req, res, next) => {
  const { invoiceId } = req.params;
  
  // Pass organizationId to service to ensure isolation
  const sales = await SalesService.createFromInvoice(invoiceId, req.user.organizationId);
  
  if (!sales) return next(new AppError('Could not create sales from this invoice', 400));

  res.status(201).json({
    status: 'success',
    data: { data: sales }
  });
});

/**
 * STANDARD CRUD OPERATIONS
 * Powered by Handler Factory
 */

// GET ALL: Supports search, filter (customer, invoice, branch), and pagination
exports.getAllSales = factory.getAll(Sales, {
  populate: salesPopulate,
  searchFields: ['invoiceNumber', 'notes', 'status']
});

// GET ONE: Includes security check and population
exports.getSales = factory.getOne(Sales, { populate: salesPopulate });

// UPDATE: Validation is handled in the route or can be wrapped here
exports.updateSales = catchAsync(async (req, res, next) => {
  const { error, value } = updateSalesSchema.validate(req.body);
  if (error) return next(new AppError(error.message, 400));
  
  // We use updateOne factory logic but pass the validated value
  req.body = value;
  return factory.updateOne(Sales)(req, res, next);
});

// DELETE: Supports soft-delete automatically if 'isDeleted' exists in Sales model
exports.deleteSales = factory.deleteOne(Sales);

/**
 * ADDITIONAL TOOLS
 */
exports.getSalesStats = factory.getStats(Sales);
exports.exportSales = factory.exportData(Sales, { populate: salesPopulate });
