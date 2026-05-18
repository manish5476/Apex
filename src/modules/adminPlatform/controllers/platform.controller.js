const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const platform = require('../services/platformData.service');
const { writeAudit } = require('../services/platformAudit.service');
const { sendSuccess, getPagination, paginated } = require('../utils/adminResponse');

exports.dashboard = catchAsync(async (req, res) => {
  sendSuccess(res, await platform.dashboardSummary(req), 'Apex admin dashboard summary');
});

exports.listAdmins = catchAsync(async (req, res) => {
  const pagination = getPagination(req.query);
  const result = await platform.listAdmins(req, { ...pagination, ...req.query });
  sendSuccess(res, paginated(result.items, result.total, result.page, result.limit));
});

exports.createAdmin = catchAsync(async (req, res, next) => {
  const required = ['name', 'email', 'phone', 'password'];
  const missing = required.filter((field) => !req.body[field]);
  if (missing.length) return next(new AppError(`Missing required fields: ${missing.join(', ')}`, 400));
  if (!req.user.organizationId && !req.body.organizationId) {
    return next(new AppError('organizationId is required for platform-level admin creation', 400));
  }
  const admin = await platform.createAdmin(req, req.body);
  await writeAudit(req, {
    action: 'CREATE',
    resource: 'Admin',
    resourceId: admin._id,
    after: { email: admin.email, isSuperAdmin: admin.isSuperAdmin, role: admin.role },
  });
  sendSuccess(res, admin, 'Admin created', 201);
});

exports.listUsers = catchAsync(async (req, res) => {
  const pagination = getPagination(req.query);
  const result = await platform.listUsers(req, { ...pagination, ...req.query });
  sendSuccess(res, paginated(result.items, result.total, result.page, result.limit));
});

exports.blockUser = catchAsync(async (req, res, next) => {
  const user = await platform.updateUserState(req, req.params.userId, {
    isLoginBlocked: true,
    blockReason: req.body.reason || 'Blocked by admin platform',
  });
  if (!user) return next(new AppError('User not found', 404));
  await writeAudit(req, {
    action: 'SECURITY_EVENT',
    resource: 'User',
    resourceId: req.params.userId,
    after: { isLoginBlocked: true, reason: req.body.reason },
  });
  sendSuccess(res, user, 'User blocked');
});

exports.unblockUser = catchAsync(async (req, res, next) => {
  const user = await platform.updateUserState(req, req.params.userId, {
    isLoginBlocked: false,
    blockReason: null,
  });
  if (!user) return next(new AppError('User not found', 404));
  await writeAudit(req, {
    action: 'SECURITY_EVENT',
    resource: 'User',
    resourceId: req.params.userId,
    after: { isLoginBlocked: false },
  });
  sendSuccess(res, user, 'User unblocked');
});

exports.updateUserStatus = catchAsync(async (req, res, next) => {
  const allowed = ['pending', 'approved', 'rejected', 'inactive', 'suspended'];
  if (!allowed.includes(req.body.status)) return next(new AppError('Invalid user status', 400));
  const user = await platform.updateUserState(req, req.params.userId, { status: req.body.status });
  if (!user) return next(new AppError('User not found', 404));
  await writeAudit(req, {
    action: 'UPDATE',
    resource: 'User',
    resourceId: req.params.userId,
    after: { status: req.body.status },
  });
  sendSuccess(res, user, 'User status updated');
});

exports.assignRole = catchAsync(async (req, res, next) => {
  if (!req.body.roleId) return next(new AppError('roleId is required', 400));
  const user = await platform.assignUserRole(req, req.params.userId, req.body.roleId);
  if (!user) return next(new AppError('User not found', 404));
  await writeAudit(req, {
    action: 'UPDATE',
    resource: 'UserRole',
    resourceId: req.params.userId,
    after: { roleId: req.body.roleId },
  });
  sendSuccess(res, user, 'Role assigned');
});

exports.userSessions = catchAsync(async (req, res) => {
  sendSuccess(res, await platform.userSessions(req, req.params.userId));
});

exports.revokeUserSessions = catchAsync(async (req, res) => {
  const result = await platform.revokeUserSessions(req, req.params.userId);
  await writeAudit(req, {
    action: 'SECURITY_EVENT',
    resource: 'Session',
    resourceId: req.params.userId,
    after: { revoked: result.modifiedCount },
  });
  sendSuccess(res, { revoked: result.modifiedCount }, 'User sessions revoked');
});

exports.impersonateUser = catchAsync(async (req, res, next) => {
  if (!req.body.reason) return next(new AppError('Impersonation reason is required', 400));
  const token = await platform.createImpersonationToken(req, req.params.userId, req.body.reason);
  if (!token) return next(new AppError('User not found', 404));
  await writeAudit(req, {
    action: 'IMPERSONATE',
    resource: 'User',
    resourceId: req.params.userId,
    metadata: { reason: req.body.reason },
  });
  sendSuccess(res, token, 'Short-lived impersonation token generated');
});

exports.roles = catchAsync(async (req, res) => {
  sendSuccess(res, await platform.listRoles(req));
});

exports.permissions = catchAsync(async (_req, res) => {
  sendSuccess(res, platform.permissionsMatrix());
});

exports.settings = catchAsync(async (req, res) => {
  sendSuccess(res, await platform.listSettings(req, req.query.namespace));
});

exports.upsertSetting = catchAsync(async (req, res, next) => {
  if (!req.body.namespace || !req.body.key || typeof req.body.value === 'undefined') {
    return next(new AppError('namespace, key and value are required', 400));
  }
  const setting = await platform.upsertSetting(req, req.body);
  await writeAudit(req, {
    action: 'CONFIG_CHANGE',
    resource: 'PlatformSetting',
    resourceId: `${req.body.namespace}:${req.body.key}`,
    after: setting,
  });
  sendSuccess(res, setting, 'Setting saved');
});

exports.featureFlags = catchAsync(async (req, res) => {
  sendSuccess(res, await platform.listFeatureFlags(req));
});

exports.upsertFeatureFlag = catchAsync(async (req, res, next) => {
  if (!req.body.key || !req.body.name) return next(new AppError('key and name are required', 400));
  const flag = await platform.upsertFeatureFlag(req, req.body);
  await writeAudit(req, {
    action: 'CONFIG_CHANGE',
    resource: 'FeatureFlag',
    resourceId: req.body.key,
    after: flag,
  });
  sendSuccess(res, flag, 'Feature flag saved');
});

exports.databaseInspector = catchAsync(async (req, res) => {
  await writeAudit(req, { action: 'INTERNAL_TOOL', resource: 'DatabaseInspector' });
  sendSuccess(res, await platform.databaseInspector());
});

exports.clearCache = catchAsync(async (req, res) => {
  const result = await platform.clearCache(req.query.pattern || '*');
  await writeAudit(req, {
    action: 'INTERNAL_TOOL',
    resource: 'Cache',
    metadata: { pattern: req.query.pattern || '*', ...result },
  });
  sendSuccess(res, result, 'Cache cleared');
});

exports.logs = catchAsync(async (req, res) => {
  await writeAudit(req, { action: 'INTERNAL_TOOL', resource: 'LogsExplorer' });
  sendSuccess(res, await platform.readLogs(Number(req.query.lines || 200)));
});

exports.apiTester = catchAsync(async (req, res) => {
  sendSuccess(res, platform.apiTester(req, req.body), 'API tester echo');
});

exports.queueMonitor = catchAsync(async (_req, res) => {
  sendSuccess(res, await platform.queueMonitor());
});

exports.suspiciousActivity = catchAsync(async (req, res) => {
  sendSuccess(res, await platform.suspiciousActivity(req));
});

exports.auditLogs = catchAsync(async (req, res) => {
  const pagination = getPagination(req.query);
  const [items, total] = await platform.platformAudit(req, pagination);
  sendSuccess(res, paginated(items, total, pagination.page, pagination.limit));
});

exports.generateReport = catchAsync(async (req, res) => {
  const report = await platform.generateReport(req);
  await writeAudit(req, { action: 'EXPORT', resource: 'AdminReport', resourceId: report.id });
  sendSuccess(res, report, 'Admin report generated');
});
