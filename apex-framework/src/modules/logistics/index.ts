const express = require('express');
const router = express.Router();

/**
 * This is a NAMESPACE, not a module with its own model/service.
 * It only aggregates its sub-modules' routers below. Each one is a
 * fully independent module with its own model, repository, service,
 * events and cache — they do NOT import each other directly, only
 * communicate via the event bus.
 */
router.use('/driver', require('./driver').router);
router.use('/global-delivery-partner', require('./globalDeliveryPartner').router);
router.use('/outbox-event', require('./outboxEvent').router);
router.use('/provider-activation', require('./providerActivation').router);
router.use('/shipment', require('./shipment').router);
router.use('/shipment-activity', require('./shipmentActivity').router);
router.use('/shipment-assignment', require('./shipmentAssignment').router);
router.use('/shipment-event', require('./shipmentEvent').router);
router.use('/vehicle', require('./vehicle').router);

module.exports = { router };
