const Session = require("../models/sessionModel");
const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const mongoose = require("mongoose");

/**
 * GET /api/v1/sessions
 * Admin view: Populates user data
 */
exports.listSessions = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { userId } = req.query;

  const filter = { organizationId: orgId };
  if (userId) filter.userId = mongoose.Types.ObjectId(userId);

  const sessions = await Session.find(filter)
    .populate("userId", "name email avatar role") // <--- POPULATE ADDED HERE
    .sort({ lastActivityAt: -1 })
    .limit(200)
    .lean();

  res.status(200).json({ status: "success", results: sessions.length, data: sessions });
});

exports.mySessions = catchAsync(async (req, res, next) => {
  const sessions = await Session.find({ userId: req.user._id, organizationId: req.user.organizationId })
    .sort({ lastActivityAt: -1 })
    .lean();
  
  res.status(200).json({ status: "success", results: sessions.length, data: sessions });
});

exports.revokeSession = catchAsync(async (req, res, next) => {
  const sessionId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return next(new AppError("Invalid session id", 400));
  
  const session = await Session.findById(sessionId);
  if (!session) return next(new AppError("Session not found", 404));
  
  // Permission Checks
  if (session.organizationId.toString() !== req.user.organizationId.toString()) {
    return next(new AppError("Not permitted", 403));
  }
  
  const isOwner = session.userId.toString() === req.user._id.toString();
  const isAdmin = req.user.role?.isSuperAdmin || req.user.permissions?.includes("update_users");
  
  if (!isOwner && !isAdmin) return next(new AppError("Not permitted", 403));
  
  session.isValid = false;
  await session.save();
  
  // Socket Notification
  const io = req.app.get("io");
  if (io) {
    io.to(session.userId.toString()).emit("forceLogout", { sessionId });
  }
  
  res.status(200).json({ status: "success", message: "Session revoked", data: { sessionId } });
});

/**
 * DELETE /api/v1/sessions/:id
 * Permanently delete a session record
 */
exports.deleteSession = catchAsync(async (req, res, next) => {
  const sessionId = req.params.id;
  
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return next(new AppError("Invalid session id", 400));

  const session = await Session.findById(sessionId);
  if (!session) return next(new AppError("Session not found", 404));

  // Security Check: Ensure it belongs to same Org
  if (session.organizationId.toString() !== req.user.organizationId.toString()) {
    return next(new AppError("Not permitted", 403));
  }

  // Only Admin or Owner can delete
  const isOwner = session.userId.toString() === req.user._id.toString();
  const isAdmin = req.user.role?.isSuperAdmin;

  if (!isOwner && !isAdmin) return next(new AppError("Not permitted", 403));

  await Session.findByIdAndDelete(sessionId);

  res.status(200).json({ status: "success", message: "Session deleted" });
});

exports.revokeAllOthers = catchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  await Session.updateMany(
    { userId: req.user._id, organizationId: req.user.organizationId, token: { $ne: token } }, 
    { isValid: false }
  );
  
  const io = req.app.get("io");
  if (io) {
    io.to(req.user._id.toString()).emit("forceLogoutAllExcept", { keepToken: token });
  }
  
  res.status(200).json({ status: "success", message: "Other sessions revoked" });
});
// const Session = require("../models/sessionModel");
// const User = require("../models/userModel");
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const mongoose = require("mongoose");

// /**
//  * GET /api/v1/sessions
//  * Admin view of sessions for organization (or users own sessions)
//  */
// exports.listSessions = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { userId } = req.query;

//   const filter = { organizationId: orgId };
//   if (userId) filter.userId = mongoose.Types.ObjectId(userId);

//   const sessions = await Session.find(filter)
//     .sort({ lastActivityAt: -1 })
//     .limit(200)
//     .lean();

//   res.status(200).json({ status: "success", results: sessions.length, data: sessions });
// });

// exports.mySessions = catchAsync(async (req, res, next) => {
//   const sessions = await Session.find({ userId: req.user._id, organizationId: req.user.organizationId }).sort({ lastActivityAt: -1 }).lean();
//   res.status(200).json({ status: "success", results: sessions.length, data: sessions });
// });

// exports.revokeSession = catchAsync(async (req, res, next) => {
//   const sessionId = req.params.id;
//   if (!mongoose.Types.ObjectId.isValid(sessionId)) return next(new AppError("Invalid session id", 400));
//   const session = await Session.findById(sessionId);
//   if (!session) return next(new AppError("Session not found", 404));
//   if (session.organizationId.toString() !== req.user.organizationId.toString()) {
//     return next(new AppError("Not permitted", 403));
//   }
//   const isOwner = session.userId.toString() === req.user._id.toString();
//   const isAdmin = req.user.role?.isSuperAdmin || req.user.permissions?.includes("update_users");
//   if (!isOwner && !isAdmin) return next(new AppError("Not permitted", 403));
//   session.isValid = false;
//   await session.save();
//   const io = req.app.get("io");
//   if (io) {
//     io.to(session.userId.toString()).emit("forceLogout", { sessionId });
//   }
//   res.status(200).json({ status: "success", message: "Session revoked", data: { sessionId } });
// });

// /**
//  * PATCH /api/v1/sessions/revoke-all
//  * Revoke all other sessions for the user (useful "logout other devices")
//  */
// exports.revokeAllOthers = catchAsync(async (req, res, next) => {
//   const token = req.headers.authorization?.split(" ")[1];
//   await Session.updateMany({ userId: req.user._id, organizationId: req.user.organizationId, token: { $ne: token } }, { isValid: false });
//   // notify sockets
//   const io = req.app.get("io");
//   if (io) {
//     io.to(req.user._id.toString()).emit("forceLogoutAllExcept", { keepToken: token });
//   }
//   res.status(200).json({ status: "success", message: "Other sessions revoked" });
// });
