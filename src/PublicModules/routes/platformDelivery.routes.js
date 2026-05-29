const express = require('express');
const router = express.Router();

const { protectPlatformDeliveryAgent } = require('../middleware/platformDeliveryAuth.middleware');
const platformDeliveryController = require('../controllers/platformDelivery.controller');

// Public routes
router.post('/register', platformDeliveryController.register);
router.post('/login', platformDeliveryController.login);

// Protected routes (require platform delivery agent token)
router.use(protectPlatformDeliveryAgent);

router.patch('/update-password', platformDeliveryController.updatePassword);
router.get('/orders', platformDeliveryController.getAvailableOrders);
router.get('/scan/:identifier', platformDeliveryController.scanOrder);
router.patch('/orders/:orderId/status', platformDeliveryController.updateOrderStatus);

module.exports = router;
