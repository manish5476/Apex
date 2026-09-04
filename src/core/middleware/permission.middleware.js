const { hasPermission, hasAnyPermission, hasAllPermissions } = require("../../config/permissions");

// ── Internal helpers ──────────────────────────────────────

const notAuthenticated = (res) =>
  res.status(401).json({ status: "error", message: "Authentication required" });

const notAuthorized = (res, message = "Insufficient permissions") =>
  res.status(403).json({ status: "error", message });

const hasSpecialPrivileges = (user) =>
  user?.isOwner === true || user?.isSuperAdmin === true;

// ── Exported middleware factories ─────────────────────────

/**
 * Require ONE specific permission tag.
 *
 * Usage:  checkPermission(PERMISSIONS.LEAVE.APPROVE)
 */
const checkPermission = (required) => (req, res, next) => {
  if (!req.user?._id) return notAuthenticated(res);
  if (hasSpecialPrivileges(req.user)) return next();
  if (!hasPermission(req.user.permissions, required)) {
    return notAuthorized(res, `You don't have permission to: ${required}`);
  }
  next();
};

/**
 * Require AT LEAST ONE of the listed permission tags.
 *
 * Usage:  checkAnyPermission([PERMISSIONS.LEAVE.APPROVE, PERMISSIONS.LEAVE.ADMIN])
 */
const checkAnyPermission = (required) => (req, res, next) => {
  if (!req.user?._id) return notAuthenticated(res);
  if (hasSpecialPrivileges(req.user)) return next();
  if (!hasAnyPermission(req.user.permissions, required)) return notAuthorized(res);
  next();
};

/**
 * Require ALL of the listed permission tags.
 *
 * Usage:  checkAllPermissions([PERMISSIONS.LEAVE.APPROVE, PERMISSIONS.LEAVE.ADMIN])
 */
const checkAllPermissions = (required) => (req, res, next) => {
  if (!req.user?._id) return notAuthenticated(res);
  if (hasSpecialPrivileges(req.user)) return next();
  if (!hasAllPermissions(req.user.permissions, required)) {
    return notAuthorized(res, "Missing required permissions");
  }
  next();
};

/**
 * Restrict to organization owners only.
 * Use this instead of a permission tag when the action is owner-exclusive.
 */
const checkIsOwner = () => (req, res, next) => {
  if (!req.user?._id) return notAuthenticated(res);
  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    return notAuthorized(res, "Only organization owners can perform this action");
  }
  next();
};

/**
 * Restrict to super admins only.
 */
const checkIsSuperAdmin = () => (req, res, next) => {
  if (!req.user?._id) return notAuthenticated(res);
  if (!req.user.isSuperAdmin) {
    return notAuthorized(res, "Only super administrators can perform this action");
  }
  next();
};

module.exports = {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  checkIsOwner,
  checkIsSuperAdmin,
  hasSpecialPrivileges,
};

