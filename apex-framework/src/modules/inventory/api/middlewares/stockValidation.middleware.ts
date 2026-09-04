import { Response, NextFunction, RequestHandler } from 'express';
import { catchAsync } from '@core/http/catchAsync';
import { ApiError } from '@core/errors/ApiError';
import { AuthenticatedRequest } from '@core/http/types';
import { StockValidationService } from '../../application/services/stockValidation.service';

export interface StockValidationRequest extends AuthenticatedRequest {
  stockValidation?: any;
  stockWarnings?: any[];
  stockSummary?: any;
}

export const checkStockBeforeSale: RequestHandler = catchAsync(async (req, res, next: NextFunction) => {
  const stockReq = req as StockValidationRequest;
  const { items, branchId } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(ApiError.badRequest('Items are required for stock validation'));
  }

  const targetBranchId = branchId || stockReq.user?.branchId;

  if (!targetBranchId) {
    return next(ApiError.badRequest('Branch ID is missing. Cannot validate stock.'));
  }

  const validation = await StockValidationService.validateSale(
    items,
    targetBranchId,
    stockReq.user.organizationId
  );

  stockReq.stockValidation = validation;
  stockReq.stockWarnings = validation.warnings || [];
  stockReq.stockSummary = validation.summary || {};

  if (!validation.isValid) {
    res.status(400).json({
      status: 'fail',
      message: 'Stock validation failed',
      stock: {
        summary: validation.summary,
        items: validation.errors,
      },
    });
    return;
  }

  next();
});

export const validateStockForInvoice = checkStockBeforeSale;