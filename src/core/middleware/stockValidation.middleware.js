// src/core/middleware/stockValidation.middleware.js
const StockValidationService = require("../../modules/_legacy/services/stockValidationService");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

/**
 * Middleware to validate stock before sale
 * Attaches validation results to req.stockValidation
 */
// exports.checkStockBeforeSale = catchAsync(async (req, res, next) => {
//   const { items } = req.body;
  
//   if (!items || !Array.isArray(items) || items.length === 0) {
//     return next(new AppError('Items are required for stock validation', 400));
//   }

//   const validation = await StockValidationService.validateSale(
//     items,
//     req.user.branchId,
//     req.user.organizationId
//   );

//   // Attach validation results to request
//   req.stockValidation = validation;
//   req.stockWarnings = validation.warnings;

//   if (!validation.isValid) {
//     return next(new AppError(
//       `Stock validation failed: ${validation.errors.join(', ')}`,
//       400
//     ));
//   }

//   next();
// });
exports.checkStockBeforeSale = catchAsync(async (req, res, next) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError('Items are required for stock validation', 400));
  }

  const validation = await StockValidationService.validateSale(
    items,
    req.user.branchId,
    req.user.organizationId
  );

  // ✅ Attach EVERYTHING
  req.stockValidation = validation;
  req.stockWarnings = validation.warnings || [];
  req.stockSummary = validation.summary || {};

  if (!validation.isValid) {
    return res.status(400).json({
      status: 'fail',
      message: 'Stock validation failed',
      stock: {
        summary: validation.summary,
        items: validation.errors
      }
    });
  }

  next();
});

/**
 * Middleware to validate stock for invoice creation
 * Similar to checkStockBeforeSale but with invoice-specific logic
 */
exports.validateStockForInvoice = catchAsync(async (req, res, next) => {
  const { items } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError('Items are required for invoice creation', 400));
  }

  const validation = await StockValidationService.validateSale(
    items,
    req.user.branchId,
    req.user.organizationId
  );

  req.stockValidation = validation;
  req.stockWarnings = validation.warnings;

  if (!validation.isValid) {
    return next(new AppError(
      `Insufficient stock for invoice: ${validation.errors.join(', ')}`,
      400
    ));
  }

  next();
});

