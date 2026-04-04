'use strict';

/**
 * Sales Return Routes  (standalone)
 * ─────────────────────────────────────────────
 * Mounted at /api/v1/sales-returns
 *
 * The same endpoints also exist nested under /api/v1/sales/returns
 * for convenience. Both point to the same controller methods.
 */

const express = require('express');
const router = express.Router();

const salesReturnController = require('../../modules/inventory/core/salesReturn.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

// ─────────────────────────────────────────────
//  All routes require authentication
// ─────────────────────────────────────────────
router.use(authController.protect);

/* ============================================================
   COLLECTION ROUTES
   ============================================================ */

// Create a new return in PENDING status.
// No stock or ledger changes happen here — those happen on approval.
/**
 * POST /
 * @payload { salesId*, items*, returnReason, notes, etc }
 */
router.post(
  '/',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.createReturn
);

// List all returns with filters: status, customerId, invoiceId, startDate, endDate
// Supports pagination via ?page=1&limit=20
/**
 * GET /
 * @query { page, limit, status, customerId, invoiceId, startDate, endDate }
 * @payload none
 */
router.get(
  '/',
  checkPermission(PERMISSIONS.SALES_RETURN.READ),
  salesReturnController.getReturns
);

/* ============================================================
   APPROVAL WORKFLOW ACTIONS
   Must be defined BEFORE /:id to avoid route collisions
   ============================================================ */

// Approves a pending return.
// Triggers: stock restoration, COGS reversal, credit note journal, customer balance update.
/**
 * PATCH /:id/approve
 * @params { id }
 * @payload none
 */
router.patch(
  '/:id/approve',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.approveReturn
);

// Rejects a pending return. Requires rejectionReason in body.
// No stock or ledger changes — just marks as rejected with audit trail.
/**
 * PATCH /:id/reject
 * @params { id }
 * @payload { rejectionReason* }
 */
router.patch(
  '/:id/reject',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.rejectReturn
);

/* ============================================================
   ITEM ROUTES
   ============================================================ */

// Get full details of a single return including populated items,
// customer, invoice, and audit fields (approvedBy, rejectedBy).
/**
 * GET /:id
 * @params { id }
 * @payload none
 */
router.get(
  '/:id',
  checkPermission(PERMISSIONS.SALES_RETURN.READ),
  salesReturnController.getReturn
);

module.exports = router;
