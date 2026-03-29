const express = require('express');
const router = express.Router();
const controller = require('./webhook.controller');
const { validate, createWebhookSchema, updateWebhookSchema } = require('./webhook.validator');
const { protect, restrictTo } = require('../../modules/auth/core/auth.controller');

router.use(protect);

// Webhook CRUD
router.post('/', validate(createWebhookSchema), controller.createWebhook);
router.get('/', controller.getAllWebhooks);
router.patch('/:id', validate(updateWebhookSchema), controller.updateWebhook);
router.delete('/:id', controller.deleteWebhook);

// Actions
router.post('/:id/test', controller.testWebhook);

// Delivery logs + dashboard
router.get('/deliveries', controller.getDeliveries);
router.get('/stats', controller.getWebhookStats);
router.post('/deliveries/:deliveryId/replay', controller.replayDelivery);

module.exports = router;









