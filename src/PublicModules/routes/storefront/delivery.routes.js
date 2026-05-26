// src/routes/storefront/delivery.routes.js
const express = require('express');
const router = express.Router();

const auth = require('../../../core/middleware/auth.middleware');
const deliveryAgentController = require('../../controllers/storefront/storefrontDeliveryAgent.controller');

// Public route for login
router.post('/login', deliveryAgentController.login);

// Protected routes (require delivery agent token)
router.use(auth.protect);

// Require role 'delivery_agent' (we might need a small inline middleware if `auth.restrictTo` doesn't handle custom token roles cleanly)
router.use((req, res, next) => {
  if (req.user && req.user.role === 'delivery_agent') {
    return next();
  }
  // Alternatively, if staff logs in, they might have role 'staff' or similar
  if (req.user && (req.user.role === 'staff' || req.user.role === 'admin')) {
      return next();
  }
  return res.status(403).json({ status: 'fail', message: 'You do not have permission to perform this action' });
});

router.get('/orders', deliveryAgentController.getAssignedOrders);
router.patch('/orders/:orderId/status', deliveryAgentController.updateOrderStatus);

module.exports = router;
