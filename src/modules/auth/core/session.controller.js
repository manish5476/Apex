const Session = require("./session.model");
const User = require("./user.model");
const catchAsync = require("../../../core/utils/api/catchAsync");
const AppError = require("../../../core/utils/api/appError");
const mongoose = require("mongoose");


exports.listSessions = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { userId, isValid, device, browser, ipAddress, startDate, endDate } = req.query;

  // 1. Build Dynamic Filter
  const filter = { organizationId: orgId };

  if (userId) filter.userId = userId;
  if (isValid) filter.isValid = isValid === 'true';
  if (device) filter.device = { $regex: device, $options: 'i' }; // Case-insensitive partial match
  if (browser) filter.browser = browser;
  if (ipAddress) filter.ipAddress = ipAddress;

  // Date Range Filtering
  if (startDate || endDate) {
    filter.lastActivityAt = {};
    if (startDate) filter.lastActivityAt.$gte = new Date(startDate);
    if (endDate) filter.lastActivityAt.$lte = new Date(endDate);
  }

  const sessions = await Session.find(filter)
    .populate("userId", "name email avatar role")
    .sort({ lastActivityAt: -1 })
    .limit(200)
    .lean();

  res.status(200).json({ status: "success", results: sessions.length, data: sessions });
});

/**
 * DELETE /api/v1/sessions/bulk-delete
 * Body: { ids: ["id1", "id2"] }
 */
exports.bulkDeleteSessions = catchAsync(async (req, res, next) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new AppError("Please provide an array of session IDs", 400));
  }

  // Security: Only delete sessions belonging to the user's organization
  const result = await Session.deleteMany({
    _id: { $in: ids },
    organizationId: req.user.organizationId
  });

  res.status(200).json({
    status: "success",
    message: `${result.deletedCount} sessions deleted permanently`,
    data: { deletedCount: result.deletedCount }
  });
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