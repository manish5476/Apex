const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../../auth/core/user.model');
const Role = require('../../auth/core/role.model');
const Session = require('../../auth/core/session.model');
const Organization = require('../../organization/core/organization.model');
const ActivityLog = require('../../activity/activityLogModel');
const PlatformSetting = require('../models/platformSetting.model');
const FeatureFlag = require('../models/featureFlag.model');
const PlatformAudit = require('../models/platformAudit.model');
const { PERMISSIONS_LIST } = require('../../../config/permissions');
const { safeCache, healthCheck } = require('../../../config/redis');

const tryRequire = (modulePath) => {
  try {
    return require(modulePath);
  } catch {
    return null;
  }
};

const Customer = tryRequire('../../organization/core/customer.model');
const Supplier = tryRequire('../../organization/core/supplier.model');
const Branch = tryRequire('../../organization/core/branch.model');
const Product = tryRequire('../../inventory/core/model/product.model');
const Sales = tryRequire('../../inventory/core/model/sales.model');
const Purchase = tryRequire('../../inventory/core/model/purchase.model');
const Invoice = tryRequire('../../accounting/billing/invoice.model');
const Payment = tryRequire('../../accounting/payments/payment.model');
const Notification = tryRequire('../../notification/core/notification.model');
const Asset = tryRequire('../../uploads/asset.model');
const Webhook = tryRequire('../../webhook/webhook.model');
const WebhookDelivery = tryRequire('../../webhook/webhookDelivery.model');

const count = (Model, filter = {}) => (Model ? Model.countDocuments(filter) : Promise.resolve(0));

const orgFilter = (req, extra = {}) => {
  if (req.user?.isOwner || req.user?.isSuperAdmin) return extra;
  return { ...extra, organizationId: req.user.organizationId };
};

const listModels = () =>
  mongoose.connection.modelNames().sort().map((name) => {
    const model = mongoose.connection.model(name);
    return {
      name,
      collection: model.collection.name,
      indexes: Object.keys(model.schema.indexes?.() || {}).length,
      paths: Object.keys(model.schema.paths).length,
    };
  });

const dashboardSummary = async (req) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const base = orgFilter(req);

  const [
    organizations,
    admins,
    users,
    activeSessions,
    customers,
    suppliers,
    products,
    sales,
    purchases,
    invoices,
    payments,
    notifications,
    activity24h,
    audit24h,
    redis,
  ] = await Promise.all([
    count(Organization),
    count(User, { ...base, $or: [{ isOwner: true }, { isSuperAdmin: true }] }),
    count(User, base),
    count(Session, { ...base, isValid: true }),
    count(Customer, base),
    count(Supplier, base),
    count(Product, base),
    count(Sales, base),
    count(Purchase, base),
    count(Invoice, base),
    count(Payment, base),
    count(Notification, base),
    count(ActivityLog, { ...base, createdAt: { $gte: since24h } }),
    count(PlatformAudit, { ...base, createdAt: { $gte: since24h } }),
    healthCheck(),
  ]);

  return {
    organizations,
    admins,
    users,
    activeSessions,
    customers,
    suppliers,
    products,
    sales,
    purchases,
    invoices,
    payments,
    notifications,
    activity24h,
    platformAudit24h: audit24h,
    redis,
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      loadAverage: os.loadavg(),
      node: process.version,
    },
  };
};

const listUsers = async (req, { page, limit, skip, search, status, role }) => {
  const filter = orgFilter(req, { isDeleted: { $ne: true } });
  if (status) filter.status = status;
  if (role) filter.role = role;
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
      { 'employeeProfile.employeeId': new RegExp(search, 'i') },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select('-password -refreshTokens -passwordResetToken -emailVerificationToken')
      .populate('role', 'name permissions isSuperAdmin')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

const listAdmins = async (req, pagination) => {
  const filter = orgFilter(req, {
    isDeleted: { $ne: true },
    $or: [{ isOwner: true }, { isSuperAdmin: true }],
  });
  if (pagination.search) {
    filter.$and = [{
      $or: [
        { name: new RegExp(pagination.search, 'i') },
        { email: new RegExp(pagination.search, 'i') },
        { phone: new RegExp(pagination.search, 'i') },
      ],
    }];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select('-password -refreshTokens -passwordResetToken -emailVerificationToken')
      .populate('role', 'name permissions isSuperAdmin')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  return { items, total, page: pagination.page, limit: pagination.limit };
};

const createAdmin = async (req, body) => {
  const user = await User.create({
    organizationId: body.organizationId || req.user.organizationId,
    branchId: body.branchId,
    name: body.name,
    email: body.email?.toLowerCase(),
    phone: body.phone,
    password: body.password,
    passwordConfirm: body.passwordConfirm || body.password,
    role: body.roleId,
    isSuperAdmin: !!body.isSuperAdmin,
    status: body.status || 'approved',
    isActive: true,
    maxConcurrentSessions: body.maxConcurrentSessions || 3,
    employeeProfile: {
      departmentId: body.departmentId,
      designationId: body.designationId,
      employmentType: body.employmentType || 'permanent',
    },
    createdBy: req.user._id,
  });

  return User.findById(user._id)
    .select('-password -refreshTokens -passwordResetToken -emailVerificationToken')
    .populate('role', 'name permissions isSuperAdmin')
    .lean();
};

const updateUserState = async (req, userId, state) => {
  const update = {};
  if (state.status) update.status = state.status;
  if (typeof state.isActive === 'boolean') update.isActive = state.isActive;
  if (typeof state.isLoginBlocked === 'boolean') {
    update.isLoginBlocked = state.isLoginBlocked;
    update.blockReason = state.blockReason;
    update.blockedAt = state.isLoginBlocked ? new Date() : null;
    update.blockedBy = state.isLoginBlocked ? req.user._id : null;
  }
  update.updatedBy = req.user._id;

  return User.findOneAndUpdate(
    orgFilter(req, { _id: userId }),
    update,
    { new: true, runValidators: true }
  )
    .select('-password -refreshTokens')
    .lean();
};

const assignUserRole = async (req, userId, roleId) =>
  User.findOneAndUpdate(
    orgFilter(req, { _id: userId }),
    { role: roleId, updatedBy: req.user._id },
    { new: true }
  ).select('-password -refreshTokens');

const userSessions = (req, userId) =>
  Session.find(orgFilter(req, { userId }))
    .select('-token -previousToken -refreshToken')
    .sort({ lastActivityAt: -1 })
    .lean();

const revokeUserSessions = (req, userId) =>
  Session.updateMany(orgFilter(req, { userId, isValid: true }), { isValid: false });

const createImpersonationToken = async (req, userId, reason) => {
  const target = await User.findOne(orgFilter(req, { _id: userId })).select('_id email organizationId').lean();
  if (!target) return null;
  const token = jwt.sign(
    {
      id: target._id,
      impersonatedBy: req.user._id,
      reason,
      type: 'impersonation',
    },
    process.env.JWT_SECRET || 'change_this_secret',
    { expiresIn: '15m' }
  );
  return { token, expiresIn: 900, targetUser: target };
};

const listRoles = (req) =>
  Role.find(orgFilter(req, { isDeleted: { $ne: true } }))
    .sort({ name: 1 })
    .lean();

const permissionsMatrix = () => {
  const grouped = {};
  PERMISSIONS_LIST.forEach((permission) => {
    grouped[permission.group] = grouped[permission.group] || [];
    grouped[permission.group].push(permission);
  });
  return grouped;
};

const listSettings = (req, namespace) => {
  const filter = orgFilter(req);
  if (namespace) filter.namespace = namespace.toLowerCase();
  return PlatformSetting.find(filter).sort({ namespace: 1, key: 1 }).lean();
};

const upsertSetting = (req, body) =>
  PlatformSetting.findOneAndUpdate(
    orgFilter(req, {
      namespace: body.namespace.toLowerCase(),
      key: body.key.toLowerCase(),
    }),
    {
      $set: {
        value: body.value,
        encrypted: !!body.encrypted,
        description: body.description,
        updatedBy: req.user._id,
      },
      $setOnInsert: {
        organizationId: req.user.organizationId || null,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

const listFeatureFlags = (req) => FeatureFlag.find(orgFilter(req)).sort({ key: 1 }).lean();

const upsertFeatureFlag = (req, body) =>
  FeatureFlag.findOneAndUpdate(
    orgFilter(req, { key: body.key.toLowerCase() }),
    {
      $set: {
        name: body.name,
        description: body.description,
        enabled: !!body.enabled,
        rules: body.rules || {},
        updatedBy: req.user._id,
      },
      $setOnInsert: {
        organizationId: req.user.organizationId || null,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

const databaseInspector = async () => {
  const collections = await Promise.all(
    mongoose.connection.modelNames().sort().map(async (name) => {
      const model = mongoose.connection.model(name);
      return {
        model: name,
        collection: model.collection.name,
        documents: await model.estimatedDocumentCount(),
        indexes: await model.collection.indexes().catch(() => []),
      };
    })
  );
  return {
    database: mongoose.connection.name,
    readyState: mongoose.connection.readyState,
    models: listModels(),
    collections,
  };
};

const clearCache = async (pattern = '*') => ({ cleared: await safeCache.clear(pattern) });

const readLogs = async (lines = 200) => {
  const logDir = path.join(process.cwd(), 'logs');
  const files = (await fs.readdir(logDir).catch(() => [])).filter((file) => file.endsWith('.log')).sort();
  const file = files.at(-1);
  if (!file) return { file: null, lines: [] };
  const content = await fs.readFile(path.join(logDir, file), 'utf8');
  return { file, lines: content.split(/\r?\n/).slice(-Math.min(lines, 1000)) };
};

const apiTester = (req, body) => ({
  echo: body || {},
  request: {
    method: req.method,
    path: req.originalUrl,
    requestId: req.id,
    actor: req.user?.email,
    ip: req.ip,
  },
  generatedAt: new Date().toISOString(),
});

const queueMonitor = async () => ({
  note: 'This backend currently uses cron jobs and Redis cache; BullMQ queues are not wired in apex-crm-backend.',
  redis: await healthCheck(),
  cronJobs: [
    'announcementCron',
    'emiCronJob',
    'emiReminderCron',
    'inventoryAlertCronJob',
    'notificationCronJob',
    'overdueReminderCronJob',
    'paymentReminderCronJob',
  ],
});

const suspiciousActivity = (req) =>
  ActivityLog.find(
    orgFilter(req, {
      $or: [
        { action: /failed|blocked|fraud|impersonat|security/i },
        { description: /failed|blocked|fraud|impersonat|security/i },
      ],
    })
  )
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

const platformAudit = (req, { page, limit, skip }) =>
  Promise.all([
    PlatformAudit.find(orgFilter(req))
      .populate('actorId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PlatformAudit.countDocuments(orgFilter(req)),
  ]);

const generateReport = async (req) => ({
  id: crypto.randomUUID(),
  status: 'generated',
  generatedAt: new Date().toISOString(),
  summary: await dashboardSummary(req),
});

module.exports = {
  dashboardSummary,
  listUsers,
  listAdmins,
  createAdmin,
  updateUserState,
  assignUserRole,
  userSessions,
  revokeUserSessions,
  createImpersonationToken,
  listRoles,
  permissionsMatrix,
  listSettings,
  upsertSetting,
  listFeatureFlags,
  upsertFeatureFlag,
  databaseInspector,
  clearCache,
  readLogs,
  apiTester,
  queueMonitor,
  suspiciousActivity,
  platformAudit,
  generateReport,
};
