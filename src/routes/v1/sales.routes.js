'use strict';

const express = require('express');
const router = express.Router();

const salesController = require('../../modules/inventory/core/sales.controller');
const salesReturnController = require('../../modules/inventory/core/salesReturn.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');
const { checkStockBeforeSale } = require('../../core/middleware/stockValidation.middleware');

// ─────────────────────────────────────────────
//  All sales routes require authentication
// ─────────────────────────────────────────────
router.use(authController.protect);

/* ============================================================
   ANALYTICS & REPORTING
   Must be defined BEFORE /:id to avoid route collisions
   ============================================================ */

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

// GET /api/v1/sales/totals
router.get('/totals', checkPermission(PERMISSIONS.SALES.VIEW), salesController.aggregateTotals);

/* ============================================================
   SALES RETURNS  (nested under /sales/returns)
   Kept here so they share the sales auth context.
   Also available as a standalone router — see salesReturnRoutes.js
   ============================================================ */

// POST /api/v1/sales/returns
router.post(
  '/returns',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.createReturn
);

// GET /api/v1/sales/returns
router.get(
  '/returns',
  checkPermission(PERMISSIONS.SALES_RETURN.READ),
  salesReturnController.getReturns
);

// GET /api/v1/sales/returns/:id
router.get(
  '/returns/:id',
  checkPermission(PERMISSIONS.SALES_RETURN.READ),
  salesReturnController.getReturn
);

// PATCH /api/v1/sales/returns/:id/approve
router.patch(
  '/returns/:id/approve',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.approveReturn
);

// PATCH /api/v1/sales/returns/:id/reject
router.patch(
  '/returns/:id/reject',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.rejectReturn
);

/* ============================================================
   SPECIALIZED ACTIONS
   Must be defined BEFORE /:id to avoid route collisions
   ============================================================ */

// POST /api/v1/sales/from-invoice/:invoiceId
router.post(
  '/from-invoice/:invoiceId',
  checkPermission(PERMISSIONS.SALES.MANAGE),
  salesController.createFromInvoice
);

/* ============================================================
   CORE SALES CRUD
   ============================================================ */

// GET  /api/v1/sales      — list all (with filter/search/pagination)
// POST /api/v1/sales      — create a new direct / POS sale
router
  .route('/')
  .get(
    checkPermission(PERMISSIONS.SALES.VIEW),
    salesController.getAllSales
  )
  .post(
    checkPermission(PERMISSIONS.SALES.MANAGE),
    checkStockBeforeSale,
    salesController.createSales
  );

// GET    /api/v1/sales/:id  — get one
// PUT    /api/v1/sales/:id  — update (metadata only — financial changes blocked in service)
// DELETE /api/v1/sales/:id  — cancel + reverse stock/COGS
router
  .route('/:id')
  .get(
    checkPermission(PERMISSIONS.SALES.VIEW),
    salesController.getSales
  )
  .put(
    checkPermission(PERMISSIONS.SALES.MANAGE),
    salesController.updateSales
  )
  .delete(
    checkPermission(PERMISSIONS.SALES.MANAGE),
    salesController.deleteSales
  );

module.exports = router;
