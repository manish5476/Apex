'use strict';

const express = require('express');
const { protect } = require('../../../core/middleware/auth.middleware');
const shipmentController = require('../controllers/shipment.controller');

const router = express.Router();

router.use(protect);

router.get('/operations/summary', shipmentController.getOperationsSummary);
router
  .route('/shipments')
  .get(shipmentController.listShipments)
  .post(shipmentController.createShipment);

router
  .route('/shipments/:shipmentId')
  .get(shipmentController.getShipment);

router.patch('/shipments/:shipmentId/transition', shipmentController.transitionShipment);

module.exports = router;
