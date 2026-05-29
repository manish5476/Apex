// src/routes/storefront/delivery.routes.js
const express = require('express');
const router = express.Router();

const { protectStorefrontDeliveryAgent } = require('../../middleware/storefrontDeliveryAuth.middleware');
const deliveryAgentController = require('../../controllers/storefront/storefrontDeliveryAgent.controller');

// Public route for login
router.post('/login', deliveryAgentController.login);

// Protected routes (require merchant-scoped delivery agent token)
router.use(protectStorefrontDeliveryAgent);

router.patch('/update-password', deliveryAgentController.updatePassword);
router.get('/orders', deliveryAgentController.getAssignedOrders);
router.get('/scan/:identifier', deliveryAgentController.scanOrder);
router.patch('/orders/:orderId/status', deliveryAgentController.updateOrderStatus);

module.exports = router;
