const express = require('express');
const salesController = require('../../modules/inventory/core/sales.controller');
const salesReturnController = require('../../modules/inventory/core/salesReturn.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");
// const { validate } = require("../../middleware/validationMiddleware"); 
// const { createSalesSchema, updateSalesSchema } = require('../../shared/validations/salesValidation');
const { checkStockBeforeSale } = require("../../core/middleware/stockValidation.middleware");

const router = express.Router();

// 1. GLOBAL PROTECTION
// All sales routes require a logged-in user
router.use(authController.protect);

/**
 * =============================================================
 * SPECIALIZED ANALYTICS & EXPORTS
 * These must be defined BEFORE /:id routes to avoid collisions
 * =============================================================
 */
router.get('/stats', checkPermission(PERMISSIONS.SALES.VIEW), salesController.getSalesStats);
router.get('/export', checkPermission(PERMISSIONS.SALES.VIEW), salesController.exportSales);


/**
 * =============================================================
 * SALES RETURNS
 * Changed paths to '/returns' to prevent collision with base '/'
 * =============================================================
 */
router.post('/returns', checkPermission(PERMISSIONS.SALES_RETURN.MANAGE), salesReturnController.createReturn);
router.get('/returns', checkPermission(PERMISSIONS.SALES_RETURN.READ), salesReturnController.getReturns);


/**
 * =============================================================
 * CORE SALES OPERATIONS
 * =============================================================
 */
// Specialized action: Create sale record from an existing Invoice
router.post('/from-invoice/:invoiceId', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.createFromInvoice);

router.route('/')
  // List all sales (with filtering/search/pagination)
  .get(checkPermission(PERMISSIONS.SALES.VIEW), salesController.getAllSales)
  // Create a new direct sale (Merged stock validation here!)
  .post(
    checkPermission(PERMISSIONS.SALES.MANAGE), 
    checkStockBeforeSale, 
    // validate(createSalesSchema), 
    salesController.createSales
  );

router.route('/:id')
  // Get detailed view of a single sale
  .get(checkPermission(PERMISSIONS.SALES.VIEW), salesController.getSales)
  // Update sale details
  .put(
    checkPermission(PERMISSIONS.SALES.MANAGE), 
    // validate(updateSalesSchema), 
    salesController.updateSales
  )
  // Delete sale (supports soft-delete via Factory)
  .delete(checkPermission(PERMISSIONS.SALES.MANAGE), salesController.deleteSales);

module.exports = router;
