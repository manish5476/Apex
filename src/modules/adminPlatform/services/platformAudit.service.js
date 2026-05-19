const PlatformAudit = require('../models/platformAudit.model');

const writeAudit = async (req, payload) => {
  try {
    await PlatformAudit.create({
      organizationId: req.user?.organizationId || null,
      actorId: req.user?._id || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
      ...payload,
    });
  } catch (err) {
    // Audit logging must not break the primary admin operation.
    console.warn('Platform audit write failed:', err.message);
  }
};

module.exports = { writeAudit };
