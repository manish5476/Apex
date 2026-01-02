// routes/reconciliationRoutes.js
const router = require('express').Router();
const reconciliationController = require('../../modules/accounting/core/reconciliation.controller');
const paymentWebhookController = require('../../modules/accounting/payments/payment.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

// Webhook (no auth required)
router.post('/webhook/payment', paymentWebhookController.paymentGatewayWebhook);

// Manual reconciliation (admin only)
router.use(checkPermission(PERMISSIONS.RECONCILIATION.MANAGE));

router.get('/pending', reconciliationController.getPendingReconciliations);
router.post('/manual', reconciliationController.manualReconcilePayment);
router.get('/summary', reconciliationController.getReconciliationSummary);

module.exports = router;

// // routes/reconciliationRoutes.js
// const router = require('express').Router();
// const reconciliationController = require('../../controllers/reconciliationController');
// const paymentWebhookController = require('../../controllers/paymentWebhookController');
// const { checkPermission } = require('../../core/middleware/permission.middleware');

// // Webhook (no auth required)
// router.post('/webhook/payment', paymentWebhookController.paymentGatewayWebhook);

// // Manual reconciliation (admin only)
// router.use(checkPermission(['FINANCE_RECONCILE']));

// router.get('/pending', reconciliationController.getPendingReconciliations);
// router.post('/manual', reconciliationController.manualReconcilePayment);
// router.get('/summary', reconciliationController.getReconciliationSummary);

// module.exports = router;