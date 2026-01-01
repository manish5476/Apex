const express = require('express');
const salesController = require('../../controllers/salesController');
const salesReturnController = require('../../controllers/salesReturnController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");
// const { validate } = require("../../middleware/validationMiddleware"); // Assuming you have this helper
const { createSalesSchema, updateSalesSchema } = require('../../validations/salesValidation');
const { checkStockBeforeSale } = require("../../middleware/stockValidationMiddleware");

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

// GET /api/v1/sales/stats
router.get(
  '/stats', 
  checkPermission(PERMISSIONS.SALES.VIEW), 
  salesController.getSalesStats
);

// GET /api/v1/sales/export
router.get(
  '/export', 
  checkPermission(PERMISSIONS.SALES.VIEW), 
  salesController.exportSales
);

/**
 * =============================================================
 * CORE SALES OPERATIONS
 * =============================================================
 */

// In your sales routes
router.post(
  '/',
  authController.protect,
  checkStockBeforeSale,
  salesController.createSales
);

router
  .route('/')
  // List all sales (with filtering/search/pagination)
  .get(
    checkPermission(PERMISSIONS.SALES.VIEW), 
    salesController.getAllSales
  )
  // Create a new direct sale
  .post(
    checkPermission(PERMISSIONS.SALES.MANAGE), 
    // validate(createSalesSchema), // Validate Joi schema before controller
    salesController.createSales
  );

// Specialized action: Create sale record from an existing Invoice
router.post(
  '/from-invoice/:invoiceId', 
  checkPermission(PERMISSIONS.SALES.MANAGE), 
  salesController.createFromInvoice
);

router
  .route('/:id')
  // Get detailed view of a single sale
  .get(
    checkPermission(PERMISSIONS.SALES.VIEW), 
    salesController.getSales
  )
  // Update sale details
  .put(
    checkPermission(PERMISSIONS.SALES.MANAGE), 
    // validate(updateSalesSchema), // Validate Joi schema before controller
    salesController.updateSales
  )
  // Delete sale (supports soft-delete via Factory)
  .delete(
    checkPermission(PERMISSIONS.SALES.MANAGE), 
    salesController.deleteSales
  );

  // Add permissions to sales return routes:
// router.use(authController.protect);

router.post('/', 
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE), 
  salesReturnController.createReturn
);

router.get('/', 
  checkPermission(PERMISSIONS.SALES_RETURN.READ), 
  salesReturnController.getReturns
);
module.exports = router;
