// src/utils/auditLogger.js
const AuditLog = require('../models/auditLogModel');

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
      // optionally include request path/query minimally
      payload.meta.request = { method: req.method, path: req.originalUrl, query: req.query || {} };
    }
    // non-blocking write is acceptable but wait for result in case caller wants confirmation
    return await AuditLog.create(payload);
  } catch (err) {
    // never throw from audit logger — but log to console/winston so it doesn't disrupt flow
    // Replace console.error with your logger if available
    console.error('AuditLog error:', err);
    return null;
  }
}

module.exports = { logAudit };
