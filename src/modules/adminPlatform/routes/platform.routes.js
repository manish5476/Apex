const express = require('express');
const authController = require('../../auth/core/auth.controller');
const platformController = require('../controllers/platform.controller');
const { checkAnyPermission, checkPermission, checkIsSuperAdmin } = require('../../../core/middleware/permission.middleware');
const { requireInternalAccess } = require('../middleware/internalAccess.middleware');

const router = express.Router();

router.use(authController.protect);

const canReadPlatform = checkAnyPermission([
  'platform:read',
  'analytics:view_executive',
  'system:manage',
]);
const canManagePlatform = checkAnyPermission([
  'platform:manage',
  'user:manage',
  'system:manage',
]);

router.get('/dashboard', canReadPlatform, platformController.dashboard);
router.get('/analytics/realtime', canReadPlatform, platformController.dashboard);
router.post('/reports', canReadPlatform, platformController.generateReport);

router.get('/admins', canManagePlatform, platformController.listAdmins);
router.post('/admins', canManagePlatform, platformController.createAdmin);
router.get('/users', checkAnyPermission(['platform:user_manage', 'user:read']), platformController.listUsers);
router.patch('/users/:userId/status', checkAnyPermission(['platform:user_manage', 'user:manage']), platformController.updateUserStatus);
router.post('/users/:userId/block', checkAnyPermission(['platform:user_manage', 'user:manage']), platformController.blockUser);
router.post('/users/:userId/unblock', checkAnyPermission(['platform:user_manage', 'user:manage']), platformController.unblockUser);
router.post('/users/:userId/roles', checkAnyPermission(['platform:role_manage', 'role:manage']), platformController.assignRole);
router.get('/users/:userId/sessions', checkPermission('auth:manage_sessions'), platformController.userSessions);
router.delete('/users/:userId/sessions', checkPermission('auth:manage_sessions'), platformController.revokeUserSessions);
router.post('/users/:userId/impersonate', checkPermission('platform:impersonate'), platformController.impersonateUser);

router.get('/roles', checkAnyPermission(['platform:role_manage', 'role:manage']), platformController.roles);
router.get('/permissions', canReadPlatform, platformController.permissions);

router.get('/settings', checkAnyPermission(['platform:settings', 'system:manage']), platformController.settings);
router.post('/settings', checkAnyPermission(['platform:settings', 'system:manage']), platformController.upsertSetting);
router.get('/feature-flags', checkAnyPermission(['platform:feature_flags', 'system:manage']), platformController.featureFlags);
router.post('/feature-flags', checkAnyPermission(['platform:feature_flags', 'system:manage']), platformController.upsertFeatureFlag);

router.get('/security/suspicious-activity', checkAnyPermission(['platform:security', 'analytics:view_security_audit']), platformController.suspiciousActivity);
router.get('/audit', checkAnyPermission(['platform:audit', 'logs:view']), platformController.auditLogs);

router.get('/developer/database-inspector', checkIsSuperAdmin(), requireInternalAccess, platformController.databaseInspector);
router.post('/developer/cache/clear', checkIsSuperAdmin(), requireInternalAccess, platformController.clearCache);
router.get('/developer/logs', checkIsSuperAdmin(), requireInternalAccess, platformController.logs);
router.post('/developer/api-tester', checkIsSuperAdmin(), requireInternalAccess, platformController.apiTester);
router.get('/developer/queues', checkIsSuperAdmin(), requireInternalAccess, platformController.queueMonitor);

module.exports = router;
