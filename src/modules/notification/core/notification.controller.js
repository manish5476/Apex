// src/modules/notification/core/notification.controller.js
const Notification = require('./notification.model');
const User = require('../../auth/core/user.model');
const mongoose = require('mongoose');
const catchAsync = require('../../../core/utils/catchAsync');
const AppError = require('../../../core/utils/appError');
const { emitToUser, emitToUsers } = require('../../../core/utils/_legacy/socket');

// /**
//  * Get user's notifications with pagination
//  */
// exports.getMyNotifications = catchAsync(async (req, res, next) => {
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 20;
//   const skip = (page - 1) * limit;
//   const { unreadOnly, type } = req.query;

//   // Filter: My ID + Organization
//   const filter = { 
//     recipientId: req.user._id,
//     organizationId: req.user.organizationId 
//   };
  
//   if (unreadOnly === 'true') {
//     filter.isRead = false;
//   }
  
//   if (type && ['info', 'success', 'warning', 'error', 'urgent'].includes(type)) {
//     filter.type = type;
//   }

//   const [notifications, total] = await Promise.all([
//     Notification.find(filter)
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .populate('createdBy', 'name email avatar')
//       .lean(),
//     Notification.countDocuments(filter)
//   ]);

//   res.status(200).json({
//     status: 'success',
//     results: notifications.length,
//     total,
//     page,
//     totalPages: Math.ceil(total / limit),
//     data: { notifications }
//   });
// });

/**
 * Get single notification
 */
exports.getNotification = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    recipientId: req.user._id
  }).populate('createdBy', 'name email avatar');

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { notification }
  });
});

/**
 * Get unread count (for badge)
 */
exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const count = await Notification.countDocuments({
    recipientId: req.user._id,
    organizationId: req.user.organizationId,
    isRead: false
  });

  res.status(200).json({
    status: 'success',
    data: { count }
  });
});

/**
 * Get notification statistics
 */
exports.getNotificationStats = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const orgId = req.user.organizationId;

  const stats = await Notification.aggregate([
    {
      $match: {
        recipientId: userId,
        organizationId: mongoose.Types.ObjectId(orgId)
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unread: {
          $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] }
        },
        byType: {
          $push: {
            type: '$type',
            isRead: '$isRead'
          }
        }
      }
    },
    {
      $project: {
        total: 1,
        unread: 1,
        byType: {
          $reduce: {
            input: '$byType',
            initialValue: {
              info: { total: 0, unread: 0 },
              success: { total: 0, unread: 0 },
              warning: { total: 0, unread: 0 },
              error: { total: 0, unread: 0 },
              urgent: { total: 0, unread: 0 }
            },
            in: {
              $let: {
                vars: {
                  type: '$$this.type',
                  isUnread: { $cond: [{ $eq: ['$$this.isRead', false] }, 1, 0] }
                },
                in: {
                  $mergeObjects: [
                    '$$value',
                    {
                      $cond: [
                        { $eq: ['$$type', 'info'] },
                        {
                          info: {
                            total: { $add: ['$$value.info.total', 1] },
                            unread: { $add: ['$$value.info.unread', '$$isUnread'] }
                          }
                        },
                        { $cond: [
                          { $eq: ['$$type', 'success'] },
                          {
                            success: {
                              total: { $add: ['$$value.success.total', 1] },
                              unread: { $add: ['$$value.success.unread', '$$isUnread'] }
                            }
                          },
                          { $cond: [
                            { $eq: ['$$type', 'warning'] },
                            {
                              warning: {
                                total: { $add: ['$$value.warning.total', 1] },
                                unread: { $add: ['$$value.warning.unread', '$$isUnread'] }
                              }
                            },
                            { $cond: [
                              { $eq: ['$$type', 'error'] },
                              {
                                error: {
                                  total: { $add: ['$$value.error.total', 1] },
                                  unread: { $add: ['$$value.error.unread', '$$isUnread'] }
                                }
                              },
                              {
                                urgent: {
                                  total: { $add: ['$$value.urgent.total', 1] },
                                  unread: { $add: ['$$value.urgent.unread', '$$isUnread'] }
                                }
                              }
                            ]}
                          ]}
                        ]}
                      ]
                    }
                  ]
                }
              }
            }
          }
        }
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats: stats[0] || {
        total: 0,
        unread: 0,
        byType: {
          info: { total: 0, unread: 0 },
          success: { total: 0, unread: 0 },
          warning: { total: 0, unread: 0 },
          error: { total: 0, unread: 0 },
          urgent: { total: 0, unread: 0 }
        }
      }
    }
  });
});

/**
 * Mark single notification as read
 */
exports.markAsRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientId: req.user._id },
    { 
      isRead: true,
      readAt: new Date(),
      readBy: req.user._id
    },
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

/**
 * Mark multiple notifications as read
 */
exports.markMultipleAsRead = catchAsync(async (req, res, next) => {
  const { notificationIds } = req.body;
  
  if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
    return next(new AppError('Please provide an array of notification IDs', 400));
  }

  const result = await Notification.updateMany(
    { 
      _id: { $in: notificationIds },
      recipientId: req.user._id,
      isRead: false
    },
    { 
      isRead: true,
      readAt: new Date(),
      readBy: req.user._id
    }
  );

  res.status(200).json({
    status: "success",
    message: `${result.modifiedCount} notifications marked as read`,
    data: { modifiedCount: result.modifiedCount }
  });
});

/**
 * Mark all notifications as read
 */
exports.markAllRead = catchAsync(async (req, res, next) => {
  const result = await Notification.updateMany(
    { 
      recipientId: req.user._id, 
      organizationId: req.user.organizationId,
      isRead: false 
    },
    { 
      isRead: true,
      readAt: new Date(),
      readBy: req.user._id
    }
  );

  res.status(200).json({ 
    status: "success", 
    message: `${result.modifiedCount} notifications marked as read`,
    data: { modifiedCount: result.modifiedCount }
  });
});

/**
 * Delete single notification
 */
exports.deleteNotification = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOneAndDelete({ 
    _id: req.params.id, 
    recipientId: req.user._id 
  });

  if (!notification) {
    return next(new AppError("Notification not found", 404));
  }

  res.status(204).json({ 
    status: "success", 
    data: null 
  });
});

/**
 * Clear all notifications
 */
exports.clearAll = catchAsync(async (req, res, next) => {
  await Notification.deleteMany({ 
    recipientId: req.user._id,
    organizationId: req.user.organizationId
  });
  
  res.status(204).json({ 
    status: "success", 
    data: null 
  });
});

/**
//  * Create a notification (admin/notification system use)
//  */
// exports.createNotification = catchAsync(async (req, res, next) => {
//   const { recipientId, title, message, type = 'info', metadata } = req.body;
  
//   // Check permissions (only admin or system can create notifications)
//   const user = await User.findById(req.user._id);
//   if (!['admin', 'superadmin', 'owner'].includes(user.role)) {
//     return next(new AppError('You do not have permission to create notifications', 403));
//   }

//   if (!recipientId || !title || !message) {
//     return next(new AppError('Recipient ID, title, and message are required', 400));
//   }

//   const notification = await Notification.create({
//     organizationId: req.user.organizationId,
//     recipientId,
//     title,
//     message,
//     type,
//     metadata: metadata || {},
//     createdBy: req.user._id,
//   });

//   // Emit via socket if recipient is online
//   emitToUser(recipientId, 'newNotification', notification);

//   res.status(201).json({
//     status: 'success',
//     data: { notification }
//   });
// });

/**
 * Create system notification (for internal use)
 */
exports.createSystemNotification = async (organizationId, recipientId, type, title, message, io = null) => {
  try {
    const notification = await Notification.create({
      organizationId,
      recipientId,
      type,
      title,
      message,
      isSystem: true,
    });

    if (io) {
      io.to(recipientId.toString()).emit('newNotification', notification);
    }
    
    return notification;
  } catch (err) {
    console.error('Create system notification error:', err);
    return null;
  }
};

// Add this method to your existing notification controller
exports.createNotification = catchAsync(async (req, res, next) => {
  const { recipientId, title, message, type = 'info', businessType, metadata, priority } = req.body;
  
  // Check permissions
  const user = await User.findById(req.user._id);
  if (!['admin', 'superadmin', 'owner', 'manager'].includes(user.role)) {
    return next(new AppError('You do not have permission to create notifications', 403));
  }

  if (!recipientId || !title || !message) {
    return next(new AppError('Recipient ID, title, and message are required', 400));
  }

  const notification = await Notification.create({
    organizationId: req.user.organizationId,
    recipientId,
    title,
    message,
    type, // UI type
    businessType: businessType || 'SYSTEM', // Business type
    metadata: metadata || {},
    priority: priority || 'normal',
    createdBy: req.user._id,
  });

  // Emit via socket
  const socketUtil = require('../../../core/utils/socket');
  socketUtil.emitToUser(recipientId, 'newNotification', notification);

  res.status(201).json({
    status: 'success',
    data: { notification }
  });
});

// Update the getMyNotifications to populate correctly
exports.getMyNotifications = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const { unreadOnly, type, businessType } = req.query;

  const filter = { 
    recipientId: req.user._id,
    organizationId: req.user.organizationId 
  };
  
  if (unreadOnly === 'true') {
    filter.isRead = false;
  }
  
  if (type && ['info', 'success', 'warning', 'error', 'urgent'].includes(type)) {
    filter.type = type;
  }
  
  if (businessType) {
    filter.businessType = businessType;
  }

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ priority: -1, createdAt: -1 }) // Sort by priority first
      .skip(skip)
      .limit(limit)
      .populate('recipientId', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .lean(),
    Notification.countDocuments(filter)
  ]);

  // Add virtual field for Angular
  const notificationsWithVirtuals = notifications.map(notification => ({
    ...notification,
    entityType: notification.entityType // virtual field
  }));

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: { notifications: notificationsWithVirtuals }
  });
});


// const Notification = require('./notification.model');
// const catchAsync = require('../../../core/utils/catchAsync');
// const AppError = require('../../../core/utils/appError');
// const APIFeatures = require('../../../core/utils/ApiFeatures'); // Standardize if you have it, else manual logic below

// // 1. Get My Notifications (Paginated)
// exports.getMyNotifications = catchAsync(async (req, res, next) => {
//   const page = parseInt(req.query.page, 10) || 1;
//   const limit = parseInt(req.query.limit, 10) || 20;
//   const skip = (page - 1) * limit;

//   // Filter: My ID + Organization
//   const filter = { 
//       recipientId: req.user.id,
//       organizationId: req.user.organizationId 
//   };

//   // Optional: Filter by read/unread
//   if (req.query.isRead !== undefined) {
//       filter.isRead = req.query.isRead === 'true';
//   }

//   const [notifications, total] = await Promise.all([
//       Notification.find(filter)
//           .sort({ createdAt: -1 })
//           .skip(skip)
//           .limit(limit),
//       Notification.countDocuments(filter)
//   ]);

//   res.status(200).json({
//     status: 'success',
//     results: notifications.length,
//     total,
//     page,
//     totalPages: Math.ceil(total / limit),
//     data: { notifications },
//   });
// });

// // 2. Get Unread Count (For Badge 🔴)
// exports.getUnreadCount = catchAsync(async (req, res, next) => {
//     const count = await Notification.countDocuments({
//         recipientId: req.user.id,
//         organizationId: req.user.organizationId,
//         isRead: false
//     });

//     res.status(200).json({
//         status: 'success',
//         data: { count }
//     });
// });

// // 3. Mark Single as Read
// exports.markAsRead = catchAsync(async (req, res, next) => {
//   const notification = await Notification.findOneAndUpdate(
//     { _id: req.params.id, recipientId: req.user.id },
//     { isRead: true },
//     { new: true }
//   );

//   if (!notification) {
//     return next(new AppError("Notification not found", 404));
//   }

//   res.status(200).json({ status: "success", data: { notification } });
// });

// // 4. Mark All as Read
// exports.markAllRead = catchAsync(async (req, res, next) => {
//   await Notification.updateMany(
//     { recipientId: req.user.id, isRead: false },
//     { isRead: true }
//   );

//   res.status(200).json({ status: "success", message: "All marked as read" });
// });

// // 5. Delete Single (Cleanup)
// exports.deleteNotification = catchAsync(async (req, res, next) => {
//     const notification = await Notification.findOneAndDelete({ 
//         _id: req.params.id, 
//         recipientId: req.user.id 
//     });

//     if (!notification) {
//         return next(new AppError("Notification not found", 404));
//     }

//     res.status(204).json({ status: "success", data: null });
// });

// // 6. Clear All (Cleanup)
// exports.clearAll = catchAsync(async (req, res, next) => {
//     await Notification.deleteMany({ recipientId: req.user.id });
//     res.status(204).json({ status: "success", data: null });
// });
