// src/controllers/notificationController.js
const Notification = require('../models/notificationModel');
const catchAsync = require('../utils/catchAsync');

exports.getMyNotifications = catchAsync(async (req, res, next) => {
  const notifications = await Notification.find({
    recipientId: req.user.id,
  }).sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    data: { notifications },
  });
});

exports.markAsRead = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  const notification = await Notification.findOneAndUpdate(
    { _id: id, user: req.user._id },
    { read: true },
    { new: true }
  );
  if (!notification) return next(new AppError("Notification not found", 404));
  res.status(200).json({ status: "success", data: { notification } });
});

exports.markAllRead = catchAsync(async (req, res, next) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.status(200).json({ status: "success", message: "All notifications marked read" });
});
