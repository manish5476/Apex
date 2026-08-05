const express = require('express');
const router = express.Router();

/**
 * This is a NAMESPACE, not a module with its own model/service.
 * It only aggregates its sub-modules' routers below. Each one is a
 * fully independent module with its own model, repository, service,
 * events and cache — they do NOT import each other directly, only
 * communicate via the event bus.
 */
router.use('/branch', require('./branch').router);
router.use('/channel', require('./channel').router);
router.use('/customer', require('./customer').router);
router.use('/organization-profile', require('./organizationProfile').router);
router.use('/transfer-request', require('./transferRequest').router);

module.exports = { router };
