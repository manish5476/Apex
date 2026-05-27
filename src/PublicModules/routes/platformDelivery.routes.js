const express = require('express');
const router = express.Router();

const auth = require('../../core/middleware/auth.middleware');
const platformDeliveryController = require('../controllers/platformDelivery.controller');

// Public routes
router.post('/register', platformDeliveryController.register);
router.post('/login', platformDeliveryController.login);

// Protected routes (require platform delivery agent token)
router.use(auth.protect);

// Require role 'platform_delivery_agent'
router.use((req, res, next) => {
  if (req.user && req.user.type === 'platform_delivery_agent') {
    return next();
  }
  return res.status(403).json({ status: 'fail', message: 'You do not have permission to perform this action' });
});

router.patch('/update-password', platformDeliveryController.updatePassword);
router.get('/orders', platformDeliveryController.getAvailableOrders);
router.get('/scan/:identifier', platformDeliveryController.scanOrder);
router.patch('/orders/:orderId/status', platformDeliveryController.updateOrderStatus);

module.exports = router;
