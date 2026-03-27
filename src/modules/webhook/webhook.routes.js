const express = require('express');
const router = express.Router();
const controller = require('./webhook.controller');
const { validate, createWebhookSchema, updateWebhookSchema } = require('./webhook.validator');
const { protect, restrictTo } = require('../../core/middleware/auth');
const { scopeToOrg } = require('../../core/middleware/scopeToOrg');

// All routes require auth + org scope
router.use(protect, scopeToOrg);

// Webhook CRUD
router.post('/',     validate(createWebhookSchema), controller.createWebhook);
router.get('/',      controller.getAllWebhooks);
router.patch('/:id', validate(updateWebhookSchema), controller.updateWebhook);
router.delete('/:id',controller.deleteWebhook);

// Actions
router.post('/:id/test',    controller.testWebhook);

// Delivery logs + dashboard
router.get('/deliveries',                              controller.getDeliveries);
router.get('/stats',                                   controller.getWebhookStats);
router.post('/deliveries/:deliveryId/replay',          controller.replayDelivery);

module.exports = router;












// One More Thing — Start the Worker
// The worker runs as a separate process, not inside your Express server:
// js// In package.json scripts:
// {
//   "scripts": {
//     "start":        "node src/server.js",
//     "start:worker": "node src/modules/webhooks/webhook.worker.js"
//   }
// }

// // Or with PM2 for production:
// // pm2 start ecosystem.config.js
// js// ecosystem.config.js
// module.exports = {
//   apps: [
//     { name: 'api',            script: 'src/server.js',                        instances: 2 },
//     { name: 'webhook-worker', script: 'src/modules/webhooks/webhook.worker.js', instances: 2 }
//   ]
// };

// What This Gives You vs Before
// FeatureBeforeNowDelivery blocking API❌ Yes✅ Fully asyncRetry on failure❌ None✅ 5 attempts, exponential backoffSSRF protection❌ None✅ DNS-level IP checkSecret storage❌ Plaintext✅ AES-256 encryptedReplay failed delivery❌ None✅ Full replay endpointCircuit breaker❌ None✅ Auto-open/close/half-openDelivery logs❌ None✅ Full log with TTL auto-purgeDashboard stats❌ None✅ Aggregated by status/timeInput validation❌ None✅ Zod schema on all routes4xx vs 5xx handling❌ Same✅ 4xx = no retry, 5xx = retry