const express = require('express');
const salesController = require('../../controllers/salesController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");
// const { validate } = require("../../middleware/validationMiddleware"); // Assuming you have this helper
const { createSalesSchema, updateSalesSchema } = require('../../validations/salesValidation');

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

module.exports = router;

// const express = require('express');
// const router = express.Router();
// const salesController = require('../../controllers/salesController');
// const authController = require('../../controllers/authController');
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect); 
// // Direct Sales Management
// router.post('/', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.createSales); 
// router.get('/', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.getAllSales);
// router.post('/from-invoice/:invoiceId', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.createFromInvoice);
// router.get('/:id', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.getSales);
// router.put('/:id', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.updateSales);
// router.delete('/:id', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.deleteSales);
// router.delete('/:id', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.getSalesStats);
// router.delete('/:id', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.exportSales);
// module.exports = router;
