const Announcement = require('./announcement.model');
const User = require('../../auth/core/user.model');
const catchAsync = require('../../../core/utils/catchAsync');
const AppError = require('../../../core/utils/appError');
const factory = require('../../../core/utils/handlerFactory');
const { emitToOrg, emitToUsers } = require('../../../core/utils/_legacy/socket');

// exports.createAnnouncement = catchAsync(async (req, res, next) => {
//   const { title, message, type, targetAudience, targetIds, expiresAt } = req.body;
  
//   // Get organization ID
//   const orgId = req.user.organizationId?.toString();
  
//   if (!orgId) {
//     return next(new AppError('Organization not found in user data.', 400));
//   }
// console.log(req.user,"00000000000000000000000000000000000000000000000000000000000000000000000000");
//   const announcementData = {
//     organizationId: orgId,
//     senderId: req.user._id, 
//     title,
//     message,
//     type,
//     targetAudience,
//     expiresAt
//   };

//   // 2. Assign target arrays based on audience type
//   if (targetAudience === 'role') {
//     if (!targetIds || targetIds.length === 0) {
//       return next(new AppError('Please provide at least one Role ID.', 400));
//     }
//     announcementData.targetRoles = targetIds;
//   } 
//   else if (targetAudience === 'specific') {
//     if (!targetIds || targetIds.length === 0) {
//       return next(new AppError('Please provide at least one User ID.', 400));
//     }
//     announcementData.targetUsers = targetIds;
//   }
  
//   console.log('Creating announcement with data:', announcementData);
  
//   const announcement = await Announcement.create(announcementData);
  
//   const socketPayload = {
//     type: 'ANNOUNCEMENT',
//     data: announcement
//   };
  
//   if (targetAudience === 'all') {
//     emitToOrg(orgId, 'newAnnouncement', socketPayload);
//   } 
//   else {
//     let recipientUserIds = [];

//     if (targetAudience === 'role') {
//       const usersWithRole = await User.find({
//         organizationId: orgId,
//         isActive: true,
//         role: { $in: targetIds } 
//       }).select('_id');
//       recipientUserIds = usersWithRole.map(u => u._id.toString());
//     } 
//     else if (targetAudience === 'specific') {
//       recipientUserIds = targetIds.map(id => id.toString());
//     }

//     if (recipientUserIds.length > 0) {
//      emitToUsers(recipientUserIds, 'newAnnouncement', socketPayload);
//     }
//   }

//   res.status(201).json({
//     status: 'success',
//     data: { announcement }
//   });
// });

// exports.getAllAnnouncements = catchAsync(async (req, res, next) => {
//   const userId = req.user._id;
//   const userRoleId = req.user.role;
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 20;
//   const skip = (page - 1) * limit;

//   const filter = {
//     organizationId: req.user.organizationId,
//     isActive: true,
//     $or: [
//       { targetAudience: 'all' },
//       { targetRoles: userRoleId },
//       { targetUsers: userId }
//     ],
//     $or: [
//       { expiresAt: null },
//       { expiresAt: { $gt: new Date() } }
//     ]
//   };

//   const [announcements, total] = await Promise.all([
//     Announcement.find(filter)
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .populate('senderId', 'name avatar'),
//     Announcement.countDocuments(filter)
//   ]);

//   res.status(200).json({
//     status: 'success',
//     page,
//     limit,
//     totalPages: Math.ceil(total / limit),
//     total,
//     data: { announcements }
//   });
// });
// const { emitToOrg, emitToUsers } = require('../../../core/utils/socket'); // Fixed import

exports.getAllAnnouncements = catchAsync(async (req, res, next) => {
  const userId = req.user._id || req.user.id;
  const userRoleId = req.user.role;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // FIXED: Combine both conditions in a single $or
  const filter = {
    organizationId: req.user.organizationId,
    isActive: true,
    $and: [
      {
        $or: [
          { targetAudience: 'all' },
          { targetRoles: userRoleId },
          { targetUsers: userId }
        ]
      },
      {
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }
    ]
  };

  const [announcements, total] = await Promise.all([
    Announcement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('senderId', 'name avatar'),
    Announcement.countDocuments(filter)
  ]);

  res.status(200).json({
    status: 'success',
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    total,
    data: { announcements }
  });
});

exports.createAnnouncement = catchAsync(async (req, res, next) => {
  const { title, message, type, targetAudience, targetIds, expiresAt } = req.body;
  
  // Get organization ID
  const orgId = req.user.organizationId?.toString();
  
  if (!orgId) {
    return next(new AppError('Organization not found in user data.', 400));
  }

  const announcementData = {
    organizationId: orgId,
    senderId: req.user._id, 
    title,
    message,
    type,
    targetAudience,
    expiresAt
  };

  // Assign target arrays based on audience type
  if (targetAudience === 'role') {
    if (!targetIds || targetIds.length === 0) {
      return next(new AppError('Please provide at least one Role ID.', 400));
    }
    announcementData.targetRoles = targetIds;
  } 
  else if (targetAudience === 'specific') {
    if (!targetIds || targetIds.length === 0) {
      return next(new AppError('Please provide at least one User ID.', 400));
    }
    announcementData.targetUsers = targetIds;
  }
  
  const announcement = await Announcement.create(announcementData);
  
  const socketPayload = {
    type: 'ANNOUNCEMENT',
    data: announcement
  };
  
  if (targetAudience === 'all') {
    emitToOrg(orgId, 'newAnnouncement', socketPayload);
  } 
  else {
    let recipientUserIds = [];

    if (targetAudience === 'role') {
      const usersWithRole = await User.find({
        organizationId: orgId,
        isActive: true,
        role: { $in: targetIds } 
      }).select('_id');
      recipientUserIds = usersWithRole.map(u => u._id.toString());
    } 
    else if (targetAudience === 'specific') {
      recipientUserIds = targetIds.map(id => id.toString());
    }

    if (recipientUserIds.length > 0) {
      emitToUsers(recipientUserIds, 'newAnnouncement', socketPayload);
    }
  }

  res.status(201).json({
    status: 'success',
    data: { announcement }
  });
});
exports.markAsRead = catchAsync(async (req, res, next) => {
  const announcement = await Announcement.findById(req.params.id);
  
  if (!announcement) {
    return next(new AppError('Announcement not found', 404));
  }

  // Check if user already marked as read
  const alreadyRead = announcement.readBy.some(
    read => read.userId.toString() === req.user.id.toString()
  );

  if (!alreadyRead) {
    announcement.readBy.push({
      userId: req.user.id,
      readAt: new Date()
    });
    await announcement.save();
  }

  res.status(200).json({
    status: 'success',
    message: 'Announcement marked as read'
  });
});

exports.updateAnnouncement = catchAsync(async (req, res, next) => {
  const announcement = await Announcement.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!announcement) {
    return next(new AppError('Announcement not found', 404));
  }

  // Re-emit updated announcement
  const socketPayload = {
    type: 'ANNOUNCEMENT_UPDATE',
    data: announcement
  };

  // Send to appropriate audience
  if (announcement.targetAudience === 'all') {
    emitToOrg(announcement.organizationId.toString(), 'announcementUpdated', socketPayload);
  } else {
  }

  res.status(200).json({
    status: 'success',
    data: { announcement }
  });
});

exports.deleteAnnouncement = factory.deleteOne(Announcement);
exports.searchAnnouncements = catchAsync(async (req, res, next) => {
  const { search, type, priority, isUrgent, startDate, endDate } = req.query;
  const userId = req.user.id;
  const userRoleId = req.user.role;

  const filter = {
    organizationId: req.user.organizationId,
    isActive: true,
    $or: [
      { targetAudience: 'all' },
      { targetRoles: userRoleId },
      { targetUsers: userId }
    ]
  };

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } }
    ];
  }

  if (type) filter.type = type;
  if (priority) filter.priority = priority;
  if (isUrgent !== undefined) filter.isUrgent = isUrgent === 'true';
  
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const announcements = await Announcement.find(filter)
    .sort({ isUrgent: -1, priority: -1, createdAt: -1 })
    .populate('senderId', 'name avatar');

  res.status(200).json({
    status: 'success',
    results: announcements.length,
    data: { announcements }
  });
});

exports.getAnnouncementStats = catchAsync(async (req, res, next) => {
  const stats = await Announcement.aggregate([
    {
      $match: {
        organizationId: mongoose.Types.ObjectId(req.user.organizationId),
        isActive: true
      }
    },
    {
      $group: {
        _id: '$targetAudience',
        count: { $sum: 1 },
        unread: {
          $sum: {
            $cond: [
              { $in: [mongoose.Types.ObjectId(req.user.id), '$readBy.userId'] },
              0,
              1
            ]
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$count' },
        totalUnread: { $sum: '$unread' },
        byAudience: {
          $push: {
            audience: '$_id',
            count: '$count',
            unread: '$unread'
          }
        }
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats: stats[0] || { total: 0, totalUnread: 0, byAudience: [] }
    }
  });
});

// exports.getAllAnnouncements = catchAsync(async (req, res, next) => {
//   const userId = req.user.id;
//   const userRoleId = req.user.role; 
  
  
//   const filter = {
//     organizationId: req.user.organizationId,
//     isActive: true,
//     $or: [
//       { targetAudience: 'all' },
//       { targetRoles: userRoleId },      
//       { targetUsers: userId }           
//     ]
//   };

//   const announcements = await Announcement.find(filter)
//     .sort({ createdAt: -1 })
//     .populate('senderId', 'name avatar'); 

//   res.status(200).json({
//     status: 'success',
//     results: announcements.length,
//     data: { announcements }
//   });
// });

