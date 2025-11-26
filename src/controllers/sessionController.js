const Session = require("../models/sessionModel");
const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const mongoose = require("mongoose");

/**
 * GET /api/v1/sessions
 * Admin view of sessions for organization (or users own sessions)
 */
exports.listSessions = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { userId } = req.query;

  const filter = { organizationId: orgId };
  if (userId) filter.userId = mongoose.Types.ObjectId(userId);

  const sessions = await Session.find(filter)
    .sort({ lastActivityAt: -1 })
    .limit(200)
    .lean();

  res.status(200).json({ status: "success", results: sessions.length, data: sessions });
});

/**
 * GET /api/v1/sessions/me
 * List current user's active sessions
 */
exports.mySessions = catchAsync(async (req, res, next) => {
  const sessions = await Session.find({ userId: req.user._id, organizationId: req.user.organizationId }).sort({ lastActivityAt: -1 }).lean();
  res.status(200).json({ status: "success", results: sessions.length, data: sessions });
});

/**
 * PATCH /api/v1/sessions/:id/revoke
 * Invalidate a session (force logout)
 */
exports.revokeSession = catchAsync(async (req, res, next) => {
  const sessionId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return next(new AppError("Invalid session id", 400));

  // Only organization owner/admins or session owner can revoke
  const session = await Session.findById(sessionId);
  if (!session) return next(new AppError("Session not found", 404));

  // if requester is not same org -> block
  if (session.organizationId.toString() !== req.user.organizationId.toString()) {
    return next(new AppError("Not permitted", 403));
  }

  // Allow owner or admins (check role.isSuperAdmin or permission)
  const isOwner = session.userId.toString() === req.user._id.toString();
  const isAdmin = req.user.role?.isSuperAdmin || req.user.permissions?.includes("update_users");
  if (!isOwner && !isAdmin) return next(new AppError("Not permitted", 403));

  session.isValid = false;
  await session.save();

  // Optionally emit socket event to that user's room if you have io available on app
  const io = req.app.get("io");
  if (io) {
    io.to(session.userId.toString()).emit("forceLogout", { sessionId });
  }

  res.status(200).json({ status: "success", message: "Session revoked", data: { sessionId } });
});

/**
 * PATCH /api/v1/sessions/revoke-all
 * Revoke all other sessions for the user (useful "logout other devices")
 */
exports.revokeAllOthers = catchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  await Session.updateMany({ userId: req.user._id, organizationId: req.user.organizationId, token: { $ne: token } }, { isValid: false });
  // notify sockets
  const io = req.app.get("io");
  if (io) {
    io.to(req.user._id.toString()).emit("forceLogoutAllExcept", { keepToken: token });
  }
  res.status(200).json({ status: "success", message: "Other sessions revoked" });
});
