const { hasPermission } = require('../../../config/permissions');

const normalizeIp = (ip = '') => ip.replace('::ffff:', '');

const requireInternalAccess = (req, res, next) => {
  const allowedIps = (process.env.INTERNAL_ADMIN_IP_WHITELIST || '127.0.0.1,::1')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  const ip = normalizeIp(req.ip || req.socket?.remoteAddress || '');
  const ipAllowed = allowedIps.some((allowed) => ip === normalizeIp(allowed) || ip.includes(normalizeIp(allowed)));
  const hasInternalPermission =
    req.user?.isSuperAdmin ||
    req.user?.isOwner ||
    hasPermission(req.user?.permissions || [], 'platform:internal_tools');

  if (!ipAllowed || !hasInternalPermission) {
    return res.status(403).json({
      status: 'error',
      message: 'Internal platform tools require super-admin permission and an allowlisted IP.',
    });
  }

  next();
};

module.exports = { requireInternalAccess };
