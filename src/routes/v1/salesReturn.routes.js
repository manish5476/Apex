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

// POST /api/v1/sales-returns
// Create a new return in PENDING status.
// No stock or ledger changes happen here — those happen on approval.
router.post(
  '/',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.createReturn
);

// GET /api/v1/sales-returns
// List all returns with filters: status, customerId, invoiceId, startDate, endDate
// Supports pagination via ?page=1&limit=20
router.get(
  '/',
  checkPermission(PERMISSIONS.SALES_RETURN.READ),
  salesReturnController.getReturns
);

/* ============================================================
   APPROVAL WORKFLOW ACTIONS
   Must be defined BEFORE /:id to avoid route collisions
   ============================================================ */

// PATCH /api/v1/sales-returns/:id/approve
// Approves a pending return.
// Triggers: stock restoration, COGS reversal, credit note journal, customer balance update.
router.patch(
  '/:id/approve',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.approveReturn
);

// PATCH /api/v1/sales-returns/:id/reject
// Rejects a pending return. Requires rejectionReason in body.
// No stock or ledger changes — just marks as rejected with audit trail.
router.patch(
  '/:id/reject',
  checkPermission(PERMISSIONS.SALES_RETURN.MANAGE),
  salesReturnController.rejectReturn
);

/* ============================================================
   ITEM ROUTES
   ============================================================ */

// GET /api/v1/sales-returns/:id
// Get full details of a single return including populated items,
// customer, invoice, and audit fields (approvedBy, rejectedBy).
router.get(
  '/:id',
  checkPermission(PERMISSIONS.SALES_RETURN.READ),
  salesReturnController.getReturn
);

module.exports = router;
