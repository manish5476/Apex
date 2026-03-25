// routes/reconciliationRoutes.js
const express = require('express');
const router = express.Router();
const reconciliationController = require('../../modules/accounting/core/reconciliation.controller');
const paymentWebhookController = require('../../modules/accounting/payments/payment.controller');
const authController = require('../../modules/auth/core/auth.controller'); // 🟢 Added this import!
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

// ======================================================
// 1. PUBLIC WEBHOOKS
// ======================================================
// Webhook (no auth required - verified via gateway signature)
router.post('/webhook/payment', paymentWebhookController.paymentGatewayWebhook);

// ======================================================
// 2. ADMIN RECONCILIATION (Requires Auth & RBAC)
// ======================================================
// 🟢 CRITICAL FIX: You must protect the route to populate req.user before checking permissions!
router.use(authController.protect);
router.use(checkPermission(PERMISSIONS.RECONCILIATION.MANAGE));

// These routes now safely have access to both req.user and the verified permission
router.get('/pending', reconciliationController.getPendingReconciliations);
router.post('/manual', reconciliationController.manualReconcilePayment);
router.get('/summary', reconciliationController.getReconciliationSummary);

module.exports = router;
