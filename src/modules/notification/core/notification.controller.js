const Notification = require('./notification.model');
const catchAsync = require('../../../core/utils/catchAsync');
const AppError = require('../../../core/utils/appError');
const APIFeatures = require('../../../core/utils/ApiFeatures'); // Standardize if you have it, else manual logic below

// 1. Get My Notifications (Paginated)
exports.getMyNotifications = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Filter: My ID + Organization
  const filter = { 
      recipientId: req.user.id,
      organizationId: req.user.organizationId 
  };

  // Optional: Filter by read/unread
  if (req.query.isRead !== undefined) {
      filter.isRead = req.query.isRead === 'true';
  }

  const [notifications, total] = await Promise.all([
      Notification.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
      Notification.countDocuments(filter)
  ]);

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: { notifications },
  });
});

// 2. Get Unread Count (For Badge 🔴)
exports.getUnreadCount = catchAsync(async (req, res, next) => {
    const count = await Notification.countDocuments({
        recipientId: req.user.id,
        organizationId: req.user.organizationId,
        isRead: false
    });

    res.status(200).json({
        status: 'success',
        data: { count }
    });
});

// 3. Mark Single as Read
exports.markAsRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientId: req.user.id },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    return next(new AppError("Notification not found", 404));
  }

  res.status(200).json({ status: "success", data: { notification } });
});

// 4. Mark All as Read
exports.markAllRead = catchAsync(async (req, res, next) => {
  await Notification.updateMany(
    { recipientId: req.user.id, isRead: false },
    { isRead: true }
  );

  res.status(200).json({ status: "success", message: "All marked as read" });
});

// 5. Delete Single (Cleanup)
exports.deleteNotification = catchAsync(async (req, res, next) => {
    const notification = await Notification.findOneAndDelete({ 
        _id: req.params.id, 
        recipientId: req.user.id 
    });

    if (!notification) {
        return next(new AppError("Notification not found", 404));
    }

    res.status(204).json({ status: "success", data: null });
});

// 6. Clear All (Cleanup)
exports.clearAll = catchAsync(async (req, res, next) => {
    await Notification.deleteMany({ recipientId: req.user.id });
    res.status(204).json({ status: "success", data: null });
});
