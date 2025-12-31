const Announcement = require('../models/announcementModel');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const { emitToOrg, emitToUser } = require('../utils/socket');

exports.createAnnouncement = catchAsync(async (req, res, next) => {
  // Expect targetIds to be an array of strings (Role IDs or User IDs)
  const { title, message, type, targetAudience, targetIds, expiresAt } = req.body;
  const orgId = req.user.organizationId.toString();

  // 1. Prepare Announcement Data
  const announcementData = {
    organizationId: orgId,
    senderId: req.user.id,
    title,
    message,
    type,
    targetAudience, // 'all', 'role', or 'specific'
    expiresAt
  };

  // 2. Assign target arrays based on audience type
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
      recipientUserIds.forEach(userId => {
        emitToUser(userId, 'newAnnouncement', socketPayload);
      });
    }
  }

  res.status(201).json({
    status: 'success',
    data: { announcement }
  });
});


exports.getAllAnnouncements = catchAsync(async (req, res, next) => {
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

  const announcements = await Announcement.find(filter)
    .sort({ createdAt: -1 })
    .populate('senderId', 'name avatar'); 

  res.status(200).json({
    status: 'success',
    results: announcements.length,
    data: { announcements }
  });
});

exports.deleteAnnouncement = factory.deleteOne(Announcement);
