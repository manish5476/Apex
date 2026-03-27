// src/core/middleware/stockValidation.middleware.js
const StockValidationService = require("../../modules/inventory/core/service/stockValidation.service");
const catchAsync = require("../utils/api/catchAsync");
const AppError = require("../utils/api/appError");

exports.checkStockBeforeSale = catchAsync(async (req, res, next) => {
  const { items, branchId } = req.body; // <-- Add branchId here

  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError('Items are required for stock validation', 400));
  }

  // Allow payload branchId, fallback to user's default branch
  const targetBranchId = branchId || req.user?.branchId;

  if (!targetBranchId) {
    return next(new AppError('Branch ID is missing. Cannot validate stock.', 400));
  }

  const validation = await StockValidationService.validateSale(
    items,
    targetBranchId, // <-- Use the resolved branch ID
    req.user.organizationId
  );

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

exports.validateStockForInvoice = catchAsync(async (req, res, next) => {
  return exports.checkStockBeforeSale(req, res, next);
});