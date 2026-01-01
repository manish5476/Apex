const StockValidationService = require('../services/stockValidationService');
const AppError = require('../utils/appError');
const catchAsync = require("../utils/catchAsync");

exports.validateStockForInvoice = catchAsync(async (req, res, next) => {
  const { items } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError('Invoice items are required', 400));
  }
  
  const validation = await StockValidationService.validateSale(
    items,
    req.user.branchId,
    req.user.organizationId
  );
  
  if (!validation.isValid) {
    return next(new AppError(
      `Stock validation failed: ${validation.errors.join(', ')}`,
      400
    ));
  }
  
  // Attach warnings to response for informational purposes
  if (validation.warnings.length > 0) {
    req.stockWarnings = validation.warnings;
  }
  
  next();
});

exports.checkStockBeforeSale = catchAsync(async (req, res, next) => {
  const { items } = req.body;
  
  const validation = await StockValidationService.validateSale(
    items,
    req.body.branchId || req.user.branchId,
    req.body.organizationId || req.user.organizationId
  );
  
  if (!validation.isValid) {
    return next(new AppError(validation.errors.join(', '), 400));
  }
  
  next();
});