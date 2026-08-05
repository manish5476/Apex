const express = require('express');
const router = express.Router();

/**
 * This is a NAMESPACE, not a module with its own model/service.
 * It only aggregates its sub-modules' routers below. Each one is a
 * fully independent module with its own model, repository, service,
 * events and cache — they do NOT import each other directly, only
 * communicate via the event bus.
 */
router.use('/counter', require('./counter').router);
router.use('/product', require('./product').router);
router.use('/purchase', require('./purchase').router);
router.use('/purchase-return', require('./purchaseReturn').router);
router.use('/sales', require('./sales').router);
router.use('/sales-return', require('./salesReturn').router);
router.use('/stock-transfer', require('./stockTransfer').router);

module.exports = { router };
