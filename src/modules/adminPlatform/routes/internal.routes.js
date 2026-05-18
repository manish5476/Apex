const express = require('express');
const authController = require('../../auth/core/auth.controller');
const platformController = require('../controllers/platform.controller');
const { checkIsSuperAdmin } = require('../../../core/middleware/permission.middleware');
const { requireInternalAccess } = require('../middleware/internalAccess.middleware');

const router = express.Router();

router.use(authController.protect, checkIsSuperAdmin(), requireInternalAccess);

router.get('/database-inspector', platformController.databaseInspector);
router.post('/cache/clear', platformController.clearCache);
router.get('/logs', platformController.logs);
router.post('/api-tester', platformController.apiTester);
router.get('/queues', platformController.queueMonitor);
router.get('/audit', platformController.auditLogs);

module.exports = router;
