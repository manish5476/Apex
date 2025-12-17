const Notification = require('../models/notificationModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// 1. Get All Notifications (History)
// This fulfills your request to see notifications even after they are checked.
exports.getMyNotifications = catchAsync(async (req, res, next) => {
  const notifications = await Notification.find({
    recipientId: req.user.id, // ✅ Correct field
  }).sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    data: { notifications },
  });
});

// 2. Mark Single Notification as Read
exports.markAsRead = catchAsync(async (req, res, next) => {
  const id = req.params.id;

  const notification = await Notification.findOneAndUpdate(
    {
      _id: id,
      recipientId: req.user.id // ✅ FIXED: Changed 'user' to 'recipientId'
    },
    { isRead: true },          // ✅ FIXED: Changed 'read' to 'isRead'
    { new: true }
  );

  if (!notification) {
    return next(new AppError("Notification not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: { notification }
  });
});

// 3. Mark All as Read
exports.markAllRead = catchAsync(async (req, res, next) => {
  await Notification.updateMany(
    {
      recipientId: req.user.id, // ✅ FIXED: Changed 'user' to 'recipientId'
      isRead: false             // ✅ FIXED: Changed 'read' to 'isRead'
    },
    { isRead: true }            // ✅ FIXED: Changed 'read' to 'isRead'
  );

  res.status(200).json({
    status: "success",
    message: "All notifications marked read"
  });
});

