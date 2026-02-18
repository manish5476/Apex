// controllers/attendance/geoFence.controller.js
const mongoose = require('mongoose');
const GeoFence = require('../../models/geoFencing.model');
const AttendanceLog = require('../../models/attendanceLog.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/catchAsync');
const AppError = require('../../../../core/utils/appError');
const factory = require('../../../../core/utils/handlerFactory');

// ======================================================
// HELPERS & VALIDATIONS
// ======================================================

const validateGeoFenceData = async (data, organizationId, excludeId = null) => {
  const { name, code } = data;
  
  // Check unique name
  const nameExists = await GeoFence.findOne({
    organizationId,
    name,
    _id: { $ne: excludeId }
  });
  if (nameExists) throw new AppError('GeoFence with this name already exists', 400);
  
  // Check unique code
  const codeExists = await GeoFence.findOne({
    organizationId,
    code,
    _id: { $ne: excludeId }
  });
  if (codeExists) throw new AppError('GeoFence with this code already exists', 400);
  
  // Validate coordinates based on type
  if (data.type === 'circle') {
    if (!data.center || !data.center.coordinates || data.center.coordinates.length !== 2) {
      throw new AppError('Circle type requires center coordinates [longitude, latitude]', 400);
    }
    if (!data.radius || data.radius < 10) {
      throw new AppError('Circle type requires radius >= 10 meters', 400);
    }
  }
  
  if (data.type === 'polygon') {
    if (!data.polygon || !data.polygon.coordinates || !data.polygon.coordinates.length) {
      throw new AppError('Polygon type requires valid coordinates', 400);
    }
  }
};

// ======================================================
// CRUD OPERATIONS
// ======================================================

/**
 * @desc    Create new geofence
 * @route   POST /api/v1/attendance/geofences
 * @access  Private (Admin only)
 */
exports.createGeoFence = catchAsync(async (req, res, next) => {
  req.body.organizationId = req.user.organizationId;
  req.body.createdBy = req.user._id;
  req.body.updatedBy = req.user._id;
  
  await validateGeoFenceData(req.body, req.user.organizationId);
  
  const geofence = await GeoFence.create(req.body);
  
  res.status(201).json({
    status: 'success',
    data: { geofence }
  });
});

/**
 * @desc    Get all geofences
 * @route   GET /api/v1/attendance/geofences
 * @access  Private
 */
exports.getAllGeoFences = factory.getAll(GeoFence, {
  searchFields: ['name', 'code', 'address.line1', 'address.city'],
  populate: [
    { path: 'branchId', select: 'name' },
    { path: 'createdBy', select: 'name' }
  ],
  sort: { name: 1 }
});

/**
 * @desc    Get single geofence
 * @route   GET /api/v1/attendance/geofences/:id
 * @access  Private
 */
exports.getGeoFence = factory.getOne(GeoFence, {
  populate: [
    { path: 'branchId', select: 'name address' },
    { path: 'applicableUsers', select: 'name employeeProfile.employeeId' },
    { path: 'applicableDepartments', select: 'name' },
    { path: 'applicableDesignations', select: 'title' },
    { path: 'createdBy', select: 'name' }
  ]
});

/**
 * @desc    Update geofence
 * @route   PATCH /api/v1/attendance/geofences/:id
 * @access  Private (Admin only)
 */
exports.updateGeoFence = catchAsync(async (req, res, next) => {
  const geofence = await GeoFence.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!geofence) {
    return next(new AppError('GeoFence not found', 404));
  }
  
  if (req.body.name || req.body.code) {
    await validateGeoFenceData(req.body, req.user.organizationId, req.params.id);
  }
  
  req.body.updatedBy = req.user._id;
  
  const updatedGeoFence = await GeoFence.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  
  res.status(200).json({
    status: 'success',
    data: { geofence: updatedGeoFence }
  });
});

/**
 * @desc    Delete geofence
 * @route   DELETE /api/v1/attendance/geofences/:id
 * @access  Private (Admin only)
 */
exports.deleteGeoFence = catchAsync(async (req, res, next) => {
  const geofence = await GeoFence.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!geofence) {
    return next(new AppError('GeoFence not found', 404));
  }
  
  // Check if geofence is in use
  const usersUsing = await User.countDocuments({
    organizationId: req.user.organizationId,
    'attendanceConfig.geoFenceId': geofence._id
  });
  
  if (usersUsing > 0) {
    return next(new AppError(
      `Cannot delete geofence used by ${usersUsing} users`,
      400
    ));
  }
  
  await geofence.deleteOne();
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// ======================================================
// GEOLOCATION OPERATIONS
// ======================================================

/**
 * @desc    Check if point is inside geofence
 * @route   POST /api/v1/attendance/geofences/:id/check-point
 * @access  Private
 */
exports.checkPoint = catchAsync(async (req, res, next) => {
  const { longitude, latitude } = req.body;
  
  if (!longitude || !latitude) {
    return next(new AppError('Please provide longitude and latitude', 400));
  }
  
  const geofence = await GeoFence.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
    isActive: true
  });
  
  if (!geofence) {
    return next(new AppError('GeoFence not found', 404));
  }
  
  const isInside = geofence.isPointInside(longitude, latitude);
  
  // Calculate distance if outside
  let distance = null;
  if (!isInside && geofence.center && geofence.radius) {
    const R = 6371e3;
    const φ1 = latitude * Math.PI / 180;
    const φ2 = geofence.center.coordinates[1] * Math.PI / 180;
    const Δφ = (geofence.center.coordinates[1] - latitude) * Math.PI / 180;
    const Δλ = (geofence.center.coordinates[0] - longitude) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distance = R * c;
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      geofence: geofence.name,
      isInside,
      distance: distance ? Math.round(distance) + ' meters' : null,
      location: { longitude, latitude }
    }
  });
});

/**
 * @desc    Find nearby geofences
 * @route   POST /api/v1/attendance/geofences/nearby
 * @access  Private
 */
exports.findNearby = catchAsync(async (req, res, next) => {
  const { longitude, latitude, radius = 1000 } = req.body;
  
  if (!longitude || !latitude) {
    return next(new AppError('Please provide longitude and latitude', 400));
  }
  
  const geofences = await GeoFence.find({
    organizationId: req.user.organizationId,
    isActive: true,
    $or: [
      {
        type: 'circle',
        center: {
          $near: {
            $geometry: { type: 'Point', coordinates: [longitude, latitude] },
            $maxDistance: radius
          }
        }
      }
    ]
  }).limit(20);
  
  // Check each geofence and calculate distance
  const results = await Promise.all(
    geofences.map(async (gf) => {
      const distance = gf.isPointInside(longitude, latitude) ? 0 :
        calculateDistance(latitude, longitude, 
          gf.center?.coordinates[1], gf.center?.coordinates[0]);
      
      return {
        _id: gf._id,
        name: gf.name,
        code: gf.code,
        type: gf.type,
        distance: Math.round(distance),
        isInside: distance === 0,
        address: gf.address
      };
    })
  );
  
  // Sort by distance
  results.sort((a, b) => a.distance - b.distance);
  
  res.status(200).json({
    status: 'success',
    results: results.length,
    data: { geofences: results }
  });
});

// Helper function for distance calculation
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ======================================================
// APPLICABILITY MANAGEMENT
// ======================================================

/**
 * @desc    Assign geofence to users
 * @route   POST /api/v1/attendance/geofences/:id/assign-users
 * @access  Private (Admin only)
 */
exports.assignToUsers = catchAsync(async (req, res, next) => {
  const { userIds } = req.body;
  
  if (!userIds || !userIds.length) {
    return next(new AppError('Please provide user IDs', 400));
  }
  
  const geofence = await GeoFence.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!geofence) {
    return next(new AppError('GeoFence not found', 404));
  }
  
  // Update geofence
  geofence.applicableUsers = userIds;
  geofence.applicableToAll = false;
  geofence.updatedBy = req.user._id;
  await geofence.save();
  
  // Update users' attendance config
  await User.updateMany(
    {
      _id: { $in: userIds },
      organizationId: req.user.organizationId
    },
    {
      $set: {
        'attendanceConfig.geoFenceId': geofence._id,
        'attendanceConfig.enforceGeoFence': true
      }
    }
  );
  
  res.status(200).json({
    status: 'success',
    data: {
      geofence: geofence.name,
      assignedUsers: userIds.length
    }
  });
});

/**
 * @desc    Assign geofence to departments
 * @route   POST /api/v1/attendance/geofences/:id/assign-departments
 * @access  Private (Admin only)
 */
exports.assignToDepartments = catchAsync(async (req, res, next) => {
  const { departmentIds } = req.body;
  
  if (!departmentIds || !departmentIds.length) {
    return next(new AppError('Please provide department IDs', 400));
  }
  
  const geofence = await GeoFence.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!geofence) {
    return next(new AppError('GeoFence not found', 404));
  }
  
  geofence.applicableDepartments = departmentIds;
  geofence.applicableToAll = false;
  geofence.updatedBy = req.user._id;
  await geofence.save();
  
  // Get all users in these departments
  const users = await User.find({
    organizationId: req.user.organizationId,
    'employeeProfile.departmentId': { $in: departmentIds },
    isActive: true
  });
  
  // Update users
  await User.updateMany(
    {
      _id: { $in: users.map(u => u._id) }
    },
    {
      $set: {
        'attendanceConfig.geoFenceId': geofence._id,
        'attendanceConfig.enforceGeoFence': true
      }
    }
  );
  
  res.status(200).json({
    status: 'success',
    data: {
      geofence: geofence.name,
      assignedDepartments: departmentIds.length,
      affectedUsers: users.length
    }
  });
});

// ======================================================
// REPORTS & ANALYTICS
// ======================================================

/**
 * @desc    Get geofence usage statistics
 * @route   GET /api/v1/attendance/geofences/:id/stats
 * @access  Private
 */
exports.getGeofenceStats = catchAsync(async (req, res, next) => {
  const geofence = await GeoFence.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!geofence) {
    return next(new AppError('GeoFence not found', 404));
  }
  
  const { days = 30 } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await AttendanceLog.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        'location.geofenceId': geofence._id,
        timestamp: { $gte: startDate }
      }
    },
    {
      $facet: {
        byStatus: [
          {
            $group: {
              _id: '$location.geofenceStatus',
              count: { $sum: 1 }
            }
          }
        ],
        byUser: [
          {
            $group: {
              _id: '$user',
              count: { $sum: 1 },
              inside: {
                $sum: {
                  $cond: [{ $eq: ['$location.geofenceStatus', 'inside'] }, 1, 0]
                }
              },
              outside: {
                $sum: {
                  $cond: [{ $eq: ['$location.geofenceStatus', 'outside'] }, 1, 0]
                }
              }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        daily: [
          {
            $group: {
              _id: {
                year: { $year: '$timestamp' },
                month: { $month: '$timestamp' },
                day: { $dayOfMonth: '$timestamp' }
              },
              count: { $sum: 1 },
              inside: {
                $sum: {
                  $cond: [{ $eq: ['$location.geofenceStatus', 'inside'] }, 1, 0]
                }
              }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
        ],
        total: [
          {
            $group: {
              _id: null,
              totalLogs: { $sum: 1 },
              inside: {
                $sum: {
                  $cond: [{ $eq: ['$location.geofenceStatus', 'inside'] }, 1, 0]
                }
              },
              outside: {
                $sum: {
                  $cond: [{ $eq: ['$location.geofenceStatus', 'outside'] }, 1, 0]
                }
              },
              uniqueUsers: { $addToSet: '$user' }
            }
          },
          {
            $project: {
              totalLogs: 1,
              inside: 1,
              outside: 1,
              uniqueUsers: { $size: '$uniqueUsers' },
              complianceRate: {
                $multiply: [
                  { $divide: ['$inside', '$totalLogs'] },
                  100
                ]
              }
            }
          }
        ]
      }
    }
  ]);
  
  // Get assigned users count
  const assignedUsers = await User.countDocuments({
    organizationId: req.user.organizationId,
    'attendanceConfig.geoFenceId': geofence._id
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      geofence: {
        _id: geofence._id,
        name: geofence.name,
        code: geofence.code
      },
      assignedUsers,
      period: `${days} days`,
      stats: stats[0]
    }
  });
});

/**
 * @desc    Get violation reports
 * @route   GET /api/v1/attendance/geofences/violations
 * @access  Private (Admin/HR)
 */
exports.getViolations = catchAsync(async (req, res, next) => {
  const { fromDate, toDate, userId } = req.query;
  
  const matchStage = {
    organizationId: req.user.organizationId,
    'location.geofenceStatus': 'outside',
    'location.geofenceId': { $exists: true }
  };
  
  if (fromDate || toDate) {
    matchStage.timestamp = {};
    if (fromDate) matchStage.timestamp.$gte = new Date(fromDate);
    if (toDate) matchStage.timestamp.$lte = new Date(toDate);
  }
  
  if (userId) {
    matchStage.user = mongoose.Types.ObjectId(userId);
  }
  
  const violations = await AttendanceLog.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userInfo'
      }
    },
    { $unwind: '$userInfo' },
    {
      $lookup: {
        from: 'geofences',
        localField: 'location.geofenceId',
        foreignField: '_id',
        as: 'geofenceInfo'
      }
    },
    {
      $project: {
        timestamp: 1,
        type: 1,
        user: {
          _id: '$userInfo._id',
          name: '$userInfo.name',
          employeeId: '$userInfo.employeeProfile.employeeId'
        },
        geofence: {
          _id: { $arrayElemAt: ['$geofenceInfo._id', 0] },
          name: { $arrayElemAt: ['$geofenceInfo.name', 0] }
        },
        location: 1,
        distance: {
          $function: {
            body: function(lat1, lon1, lat2, lon2) {
              // Simplified calculation
              return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2)) * 111000;
            },
            args: [
              { $arrayElemAt: ['$location.coordinates', 1] },
              { $arrayElemAt: ['$location.coordinates', 0] },
              { $arrayElemAt: [{ $arrayElemAt: ['$geofenceInfo.center.coordinates', 0] }, 1] },
              { $arrayElemAt: [{ $arrayElemAt: ['$geofenceInfo.center.coordinates', 0] }, 0] }
            ],
            lang: 'js'
          }
        }
      }
    },
    { $sort: { timestamp: -1 } }
  ]);
  
  // Summary statistics
  const summary = {
    totalViolations: violations.length,
    uniqueUsers: new Set(violations.map(v => v.user._id.toString())).size,
    byGeofence: violations.reduce((acc, v) => {
      const name = v.geofence.name;
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {})
  };
  
  res.status(200).json({
    status: 'success',
    data: {
      summary,
      violations: violations.slice(0, 100) // Limit to 100
    }
  });
});