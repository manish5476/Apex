// controllers/attendance/attendanceMachine.controller.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const AttendanceMachine = require('../../models/attendanceMachine.model');
const AttendanceLog = require('../../models/attendanceLog.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError = require('../../../../core/utils/api/appError');
const factory = require('../../../../core/utils/api/handlerFactory');

// ======================================================
// HELPERS & UTILITIES
// ======================================================

const generateApiKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

const validateMachineConnection = async (machine) => {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  
  // Check if machine has pinged in last 5 minutes
  if (machine.lastPingAt && machine.lastPingAt > fiveMinutesAgo) {
    machine.connectionStatus = 'online';
  } else {
    machine.connectionStatus = 'offline';
  }
  
  await machine.save();
  return machine.connectionStatus === 'online';
};

// ======================================================
// CRUD OPERATIONS
// ======================================================

/**
 * @desc    Create new attendance machine
 * @route   POST /api/v1/attendance/machines
 * @access  Private (Admin only)
 */
exports.createMachine = catchAsync(async (req, res, next) => {
  // Check if serial number already exists
  const existing = await AttendanceMachine.findOne({
    serialNumber: req.body.serialNumber
  });
  
  if (existing) {
    return next(new AppError('Machine with this serial number already exists', 400));
  }
  
  // Set organization and audit fields
  req.body.organizationId = req.user.organizationId;
  req.body.createdBy = req.user._id;
  req.body.updatedBy = req.user._id;
  
  // Generate API key
  req.body.apiKey = generateApiKey();
  
  const machine = await AttendanceMachine.create(req.body);
  
  // Remove API key from response
  machine.apiKey = undefined;
  
  res.status(201).json({
    status: 'success',
    data: { 
      machine,
      apiKey: req.body.apiKey // Return once for initial setup
    }
  });
});

/**
 * @desc    Get all machines
 * @route   GET /api/v1/attendance/machines
 * @access  Private
 */
exports.getAllMachines = factory.getAll(AttendanceMachine, {
  searchFields: ['name', 'serialNumber', 'model', 'ipAddress'],
  populate: [
    { path: 'branchId', select: 'name address' },
    { path: 'createdBy', select: 'name' }
  ],
  sort: { status: 1, name: 1 }
});

/**
 * @desc    Get single machine
 * @route   GET /api/v1/attendance/machines/:id
 * @access  Private
 */
exports.getMachine = factory.getOne(AttendanceMachine, {
  populate: [
    { path: 'branchId', select: 'name address phone' },
    { path: 'createdBy', select: 'name' },
    { path: 'updatedBy', select: 'name' }
  ]
});

/**
 * @desc    Update machine
 * @route   PATCH /api/v1/attendance/machines/:id
 * @access  Private (Admin only)
 */
exports.updateMachine = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!machine) {
    return next(new AppError('Machine not found', 404));
  }
  
  // Don't allow API key update through this route
  delete req.body.apiKey;
  
  // Set audit field
  req.body.updatedBy = req.user._id;
  
  const updatedMachine = await AttendanceMachine.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  
  res.status(200).json({
    status: 'success',
    data: { machine: updatedMachine }
  });
});

/**
 * @desc    Delete machine
 * @route   DELETE /api/v1/attendance/machines/:id
 * @access  Private (Admin only)
 */
exports.deleteMachine = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!machine) {
    return next(new AppError('Machine not found', 404));
  }
  
  // Check if machine has recent logs
  const recentLogs = await AttendanceLog.countDocuments({
    machineId: machine._id,
    timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
  });
  
  if (recentLogs > 0) {
    return next(new AppError(
      `Cannot delete machine with ${recentLogs} logs in the last 7 days. Consider deactivating instead.`,
      400
    ));
  }
  
  await machine.deleteOne();
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// ======================================================
// MACHINE OPERATIONS & STATUS
// ======================================================

/**
 * @desc    Machine ping (heartbeat)
 * @route   POST /api/v1/attendance/machines/:id/ping
 * @access  Private (Machine API Key)
 */
exports.machinePing = catchAsync(async (req, res, next) => {
  const machine = req.attendanceMachine; // Set by auth middleware
  
  machine.lastPingAt = new Date();
  machine.connectionStatus = 'online';
  
  // Update stats
  machine.stats = machine.stats || {};
  machine.stats.lastPingAt = new Date();
  
  await machine.save();
  
  // Check for any pending commands
  const commands = [];
  
  // Example: Check if sync needed
  if (!machine.lastSyncAt || 
      (new Date() - machine.lastSyncAt) > (machine.config?.syncInterval || 5) * 60 * 1000) {
    commands.push({
      type: 'SYNC',
      payload: { fullSync: false }
    });
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      serverTime: new Date(),
      commands,
      config: {
        syncInterval: machine.config?.syncInterval || 5,
        timezone: machine.config?.timezone || 'Asia/Kolkata'
      }
    }
  });
});

/**
 * @desc    Get machine status
 * @route   GET /api/v1/attendance/machines/:id/status
 * @access  Private
 */
exports.getMachineStatus = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!machine) {
    return next(new AppError('Machine not found', 404));
  }
  
  // Update connection status
  const isOnline = await validateMachineConnection(machine);
  
  // Get today's stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayLogs = await AttendanceLog.countDocuments({
    machineId: machine._id,
    timestamp: { $gte: today }
  });
  
  const recentErrors = await AttendanceLog.countDocuments({
    machineId: machine._id,
    processingStatus: 'flagged',
    timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      machine: {
        _id: machine._id,
        name: machine.name,
        serialNumber: machine.serialNumber,
        status: machine.status,
        connectionStatus: machine.connectionStatus,
        isOnline
      },
      stats: {
        totalLogs: machine.stats?.totalTransactions || 0,
        todayLogs,
        recentErrors,
        lastSyncAt: machine.lastSyncAt,
        lastPingAt: machine.lastPingAt,
        uptime: machine.lastPingAt ? 
          Math.round((new Date() - machine.lastPingAt) / (1000 * 60)) + ' minutes ago' : 
          'Never'
      }
    }
  });
});

/**
 * @desc    Regenerate API key
 * @route   POST /api/v1/attendance/machines/:id/regenerate-key
 * @access  Private (Admin only)
 */
exports.regenerateApiKey = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!machine) {
    return next(new AppError('Machine not found', 404));
  }
  
  const newApiKey = generateApiKey();
  machine.apiKey = newApiKey;
  machine.apiKeyExpires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
  machine.updatedBy = req.user._id;
  
  await machine.save();
  
  res.status(200).json({
    status: 'success',
    data: {
      machine: {
        _id: machine._id,
        name: machine.name
      },
      apiKey: newApiKey
    }
  });
});

/**
 * @desc    Test machine connection
 * @route   POST /api/v1/attendance/machines/:id/test-connection
 * @access  Private (Admin only)
 */
exports.testConnection = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!machine) {
    return next(new AppError('Machine not found', 404));
  }
  
  // Simulate connection test
  const testResult = {
    success: true,
    latency: Math.floor(Math.random() * 100) + 20, // Simulated latency
    timestamp: new Date()
  };
  
  // Update last ping on success
  if (testResult.success) {
    machine.lastPingAt = new Date();
    machine.connectionStatus = 'online';
    await machine.save();
  }
  
  res.status(200).json({
    status: 'success',
    data: testResult
  });
});

// ======================================================
// BATCH OPERATIONS & SYNC
// ======================================================

/**
 * @desc    Sync machine data
 * @route   POST /api/v1/attendance/machines/:id/sync
 * @access  Private (Machine API Key)
 */
exports.syncMachine = catchAsync(async (req, res, next) => {
  const machine = req.attendanceMachine;
  const { lastSyncTime, logs } = req.body;
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const results = {
      received: 0,
      processed: 0,
      duplicates: 0,
      errors: []
    };
    
    // Process incoming logs if any
    if (logs && Array.isArray(logs)) {
      results.received = logs.length;
      
      for (const logData of logs) {
        try {
          // Check for duplicate
          const existing = await AttendanceLog.findOne({
            machineId: machine._id,
            user: logData.userId,
            timestamp: new Date(logData.timestamp)
          }).session(session);
          
          if (existing) {
            results.duplicates++;
            continue;
          }
          
          // Find user by machine user ID
          const user = await User.findOne({
            organizationId: machine.organizationId,
            'attendanceConfig.machineUserId': logData.userId.toString()
          }).session(session);
          
          if (!user) {
            results.errors.push({
              userId: logData.userId,
              reason: 'User not mapped'
            });
            continue;
          }
          
          // Create log
          const log = await AttendanceLog.create([{
            user: user._id,
            organizationId: machine.organizationId,
            branchId: machine.branchId,
            machineId: machine._id,
            timestamp: new Date(logData.timestamp),
            type: logData.type,
            source: 'machine',
            processingStatus: 'pending',
            biometricData: logData.biometricData,
            serverTimestamp: new Date()
          }], { session });
          
          results.processed++;
        } catch (error) {
          results.errors.push({
            data: logData,
            error: error.message
          });
        }
      }
    }
    
    // Update machine stats
    machine.stats.totalTransactions += results.processed;
    machine.stats.successfulReads += results.processed;
    machine.stats.failedReads += results.errors.length;
    machine.lastSyncAt = new Date();
    machine.connectionStatus = 'online';
    await machine.save({ session });
    
    // Get pending data to send to machine
    const pendingData = {
      users: await User.find({
        organizationId: machine.organizationId,
        isActive: true,
        'attendanceConfig.machineUserId': { $exists: true }
      }).select('attendanceConfig.machineUserId name employeeProfile.employeeId').lean(),
      
      commands: []
    };
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      data: {
        syncResults: results,
        serverTime: new Date(),
        pendingData
      }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Bulk update machine status
 * @route   POST /api/v1/attendance/machines/bulk-status
 * @access  Private (Admin only)
 */
exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
  const { machineIds, status, reason } = req.body;
  
  if (!machineIds || !machineIds.length || !status) {
    return next(new AppError('Please provide machine IDs and status', 400));
  }
  
  const result = await AttendanceMachine.updateMany(
    {
      _id: { $in: machineIds },
      organizationId: req.user.organizationId
    },
    {
      $set: {
        status,
        lastError: reason,
        updatedBy: req.user._id
      }
    }
  );
  
  res.status(200).json({
    status: 'success',
    data: {
      matched: result.matchedCount,
      modified: result.modifiedCount
    }
  });
});

// ======================================================
// USER-MACHINE MAPPING
// ======================================================

/**
 * @desc    Get unmapped users
 * @route   GET /api/v1/attendance/machines/unmapped-users
 * @access  Private
 */
exports.getUnmappedUsers = catchAsync(async (req, res, next) => {
  const users = await User.find({
    organizationId: req.user.organizationId,
    isActive: true,
    'attendanceConfig.machineUserId': { $exists: false }
  })
  .select('name employeeProfile.employeeId employeeProfile.departmentId')
  .populate('employeeProfile.departmentId', 'name')
  .limit(100);
  
  res.status(200).json({
    status: 'success',
    data: { users }
  });
});

/**
 * @desc    Map user to machine
 * @route   POST /api/v1/attendance/machines/map-user
 * @access  Private (Admin only)
 */
exports.mapUserToMachine = catchAsync(async (req, res, next) => {
  const { userId, machineUserId } = req.body;
  
  const user = await User.findOne({
    _id: userId,
    organizationId: req.user.organizationId
  });
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Check if machine user ID is unique
  const existing = await User.findOne({
    organizationId: req.user.organizationId,
    'attendanceConfig.machineUserId': machineUserId,
    _id: { $ne: userId }
  });
  
  if (existing) {
    return next(new AppError('Machine User ID already assigned to another user', 400));
  }
  
  user.attendanceConfig.machineUserId = machineUserId;
  user.attendanceConfig.biometricVerified = true;
  user.updatedBy = req.user._id;
  await user.save();
  
  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

/**
 * @desc    Bulk map users
 * @route   POST /api/v1/attendance/machines/bulk-map
 * @access  Private (Admin only)
 */
exports.bulkMapUsers = catchAsync(async (req, res, next) => {
  const { mappings } = req.body;
  
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return next(new AppError('Please provide an array of mappings', 400));
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const results = {
      mapped: [],
      errors: []
    };
    
    for (const mapping of mappings) {
      try {
        const { userId, machineUserId } = mapping;
        
        // Check uniqueness
        const existing = await User.findOne({
          organizationId: req.user.organizationId,
          'attendanceConfig.machineUserId': machineUserId,
          _id: { $ne: userId }
        }).session(session);
        
        if (existing) {
          results.errors.push({
            userId,
            machineUserId,
            reason: 'Machine User ID already taken'
          });
          continue;
        }
        
        const user = await User.findByIdAndUpdate(
          userId,
          {
            $set: {
              'attendanceConfig.machineUserId': machineUserId,
              'attendanceConfig.biometricVerified': true
            },
            $push: {
              'attendanceConfig.biometricDevices': req.body.deviceId
            }
          },
          { new: true, session }
        );
        
        if (user) {
          results.mapped.push({
            userId: user._id,
            name: user.name,
            machineUserId
          });
        }
      } catch (error) {
        results.errors.push({
          mapping,
          error: error.message
        });
      }
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      data: results
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// ======================================================
// REPORTS & ANALYTICS
// ======================================================

/**
 * @desc    Get machine analytics
 * @route   GET /api/v1/attendance/machines/analytics
 * @access  Private (Admin only)
 */
exports.getMachineAnalytics = catchAsync(async (req, res, next) => {
  const { days = 30 } = req.query;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const analytics = await AttendanceMachine.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId
      }
    },
    {
      $lookup: {
        from: 'attendancelogs',
        let: { machineId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$machineId', '$$machineId'] },
              timestamp: { $gte: startDate }
            }
          }
        ],
        as: 'recentLogs'
      }
    },
    {
      $project: {
        name: 1,
        serialNumber: 1,
        status: 1,
        connectionStatus: 1,
        providerType: 1,
        branchId: 1,
        totalLogs: { $size: '$recentLogs' },
        uniqueUsers: { $size: { $setUnion: '$recentLogs.user' } },
        lastLogAt: { $max: '$recentLogs.timestamp' },
        stats: 1
      }
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalMachines: { $sum: 1 },
              activeMachines: {
                $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
              },
              onlineMachines: {
                $sum: { $cond: [{ $eq: ['$connectionStatus', 'online'] }, 1, 0] }
              },
              totalLogs: { $sum: '$totalLogs' },
              totalUniqueUsers: { $sum: '$uniqueUsers' }
            }
          }
        ],
        byStatus: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              totalLogs: { $sum: '$totalLogs' }
            }
          }
        ],
        byProvider: [
          {
            $group: {
              _id: '$providerType',
              count: { $sum: 1 }
            }
          }
        ],
        machines: [{ $sort: { totalLogs: -1 } }]
      }
    }
  ]);
  
  res.status(200).json({
    status: 'success',
    data: {
      period: `${days} days`,
      ...analytics[0]
    }
  });
});

/**
 * @desc    Get machine logs
 * @route   GET /api/v1/attendance/machines/:id/logs
 * @access  Private
 */
exports.getMachineLogs = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!machine) {
    return next(new AppError('Machine not found', 404));
  }
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;
  
  const query = {
    machineId: machine._id
  };
  
  // Date range
  if (req.query.fromDate || req.query.toDate) {
    query.timestamp = {};
    if (req.query.fromDate) query.timestamp.$gte = new Date(req.query.fromDate);
    if (req.query.toDate) query.timestamp.$lte = new Date(req.query.toDate);
  }
  
  const [logs, total] = await Promise.all([
    AttendanceLog.find(query)
      .populate('user', 'name employeeProfile.employeeId')
      .skip(skip)
      .limit(limit)
      .sort('-timestamp'),
    AttendanceLog.countDocuments(query)
  ]);
  
  res.status(200).json({
    status: 'success',
    results: logs.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: { logs }
  });
});