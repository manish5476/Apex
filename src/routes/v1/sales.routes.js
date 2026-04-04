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

/* ============================================================
   ANALYTICS & REPORTING
   Must be defined BEFORE /:id to avoid route collisions
   ============================================================ */

/**
 * GET /api/v1/sales/stats
 * @payload none
 */
router.get(
  '/stats',
  checkPermission(PERMISSIONS.SALES.VIEW),
  salesController.getSalesStats
);

/**
 * GET /api/v1/sales/export
 * @payload none
 */
router.get(
  '/export',
  checkPermission(PERMISSIONS.SALES.VIEW),
  salesController.exportSales
);

/**
 * GET /api/v1/sales/totals
 * @payload none
 */
router.get('/totals', checkPermission(PERMISSIONS.SALES.VIEW), salesController.aggregateTotals);

/* ============================================================
   SALES RETURNS  (nested under /sales/returns)
   Kept here so they share the sales auth context.
   Also available as a standalone router — see salesReturnRoutes.js
   ============================================================ */

/* ============================================================
   SALES RETURNS  (nested under /sales/returns)
   Kept here so they share the sales auth context.
   Also available as a standalone router — see salesReturnRoutes.js
   ============================================================ */

/**
 * POST /api/v1/sales/returns
 * @payload { salesId*, items*, returnReason, etc }
 */
router.post(
  '/returns',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.createReturn
);

/**
 * GET /api/v1/sales/returns
 * @payload none
 */
router.get(
  '/returns',
  checkPermission(PERMISSIONS.SALES_RETURN.READ),
  salesReturnController.getReturns
);

/**
 * GET /api/v1/sales/returns/:id
 * @params { id }
 * @payload none
 */
router.get(
  '/returns/:id',
  checkPermission(PERMISSIONS.SALES_RETURN.READ),
  salesReturnController.getReturn
);

/**
 * PATCH /api/v1/sales/returns/:id/approve
 * @params { id }
 * @payload none
 */
router.patch(
  '/returns/:id/approve',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.approveReturn
);

/**
 * PATCH /api/v1/sales/returns/:id/reject
 * @params { id }
 * @payload { rejectionReason* }
 */
router.patch(
  '/returns/:id/reject',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.rejectReturn
);

/* ============================================================
   SPECIALIZED ACTIONS
   Must be defined BEFORE /:id to avoid route collisions
   ============================================================ */

/* ============================================================
   SPECIALIZED ACTIONS
   Must be defined BEFORE /:id to avoid route collisions
   ============================================================ */

/**
 * POST /api/v1/sales/from-invoice/:invoiceId
 * @params { invoiceId }
 * @payload { items, amount, etc }
 */
router.post(
  '/from-invoice/:invoiceId',
  checkPermission(PERMISSIONS.SALES.MANAGE),
  salesController.createFromInvoice
);

/* ============================================================
   CORE SALES CRUD
   ============================================================ */

/* ============================================================
   CORE SALES CRUD
   ============================================================ */

router
  .route('/')
  /**
   * GET  /api/v1/sales      — list all (with filter/search/pagination)
   * @query { page, limit, status, etc }
   * @payload none
   */
  .get(
    checkPermission(PERMISSIONS.SALES.VIEW),
    salesController.getAllSales
  )
  /**
   * POST /api/v1/sales      — create a new direct / POS sale
   * @payload { customerId*, items*, totalAmount*, etc }
   */
  .post(
    checkPermission(PERMISSIONS.SALES.MANAGE),
    checkStockBeforeSale,
    salesController.createSales
  );

router
  .route('/:id')
  /**
   * GET    /api/v1/sales/:id  — get one
   * @params { id }
   * @payload none
   */
  .get(
    checkPermission(PERMISSIONS.SALES.VIEW),
    salesController.getSales
  )
  /**
   * PUT    /api/v1/sales/:id  — update (metadata only — financial changes blocked in service)
   * @params { id }
   * @payload { notes, metadata, etc }
   */
  .put(
    checkPermission(PERMISSIONS.SALES.MANAGE),
    salesController.updateSales
  )
  /**
   * DELETE /api/v1/sales/:id  — cancel + reverse stock/COGS
   * @params { id }
   * @payload none
   */
  .delete(
    checkPermission(PERMISSIONS.SALES.MANAGE),
    salesController.deleteSales
  );

module.exports = router;
