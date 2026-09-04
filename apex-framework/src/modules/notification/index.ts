const express = require('express');
const router = express.Router();

/**
 * This is a NAMESPACE, not a module with its own model/service.
 * It only aggregates its sub-modules' routers below. Each one is a
 * fully independent module with its own model, repository, service,
 * events and cache — they do NOT import each other directly, only
 * communicate via the event bus.
 */
router.use('/announcement', require('./announcement').router);
router.use('/message', require('./message').router);
router.use('/notification-core', require('./notificationCore').router);

module.exports = { router };
