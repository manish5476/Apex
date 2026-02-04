// src/utils/auditLogger.js
const AuditLog = require('../../modules/_legacy/models/auditLogModel');

async function logAudit({ user = {}, action, entityType = null, entityId = null, req = null, meta = {} }) {
  try {
    const payload = {
      userId: user._id || user.id || null,
      organizationId: user.organizationId || null,
      action,
      entityType,
      entityId,
      meta: {
        ...meta
      }
    };
    if (req) {
      payload.ip = req.ip || (req.headers && (req.headers['x-forwarded-for'] || req.connection?.remoteAddress)) || null;
      payload.userAgent = req.headers?.['user-agent'] || null;
      payload.meta.request = { method: req.method, path: req.originalUrl, query: req.query || {} };
    }
    return await AuditLog.create(payload);
  } catch (err) {
    console.error('AuditLog error:', err);
    return null;
  }
}

module.exports = { logAudit };
