// controllers/core/shiftGroup.controller.js
const mongoose = require('mongoose');
const ShiftGroup = require('../../models/shiftGroup.model');
const Shift = require('../../models/shift.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError = require('../../../../core/utils/api/appError');
const factory = require('../../../../core/utils/api/handlerFactory');

// ======================================================
// HELPERS & VALIDATIONS
// ======================================================

const validateShiftGroupData = async (data, organizationId, excludeId = null) => {
  const { name, code, shifts } = data;
  
  // Check unique name
  const nameExists = await ShiftGroup.findOne({
    organizationId,
    name,
    _id: { $ne: excludeId }
  });
  if (nameExists) throw new AppError('Shift group with this name already exists', 400);
  
  // Check unique code
  const codeExists = await ShiftGroup.findOne({
    organizationId,
    code,
    _id: { $ne: excludeId }
  });
  if (codeExists) throw new AppError('Shift group with this code already exists', 400);
  
  // Validate shifts
  if (shifts && shifts.length) {
    const shiftIds = shifts.map(s => s.shiftId);
    const validShifts = await Shift.find({
      _id: { $in: shiftIds },
      organizationId,
      isActive: true
    });
    
    if (validShifts.length !== shiftIds.length) {
      throw new AppError('One or more shifts are invalid or inactive', 400);
    }
  }
};

// ======================================================
// CRUD OPERATIONS
// ======================================================

/**
 * @desc    Create new shift group
 * @route   POST /api/v1/shift-groups
 * @access  Private (Admin/HR)
 */
exports.createShiftGroup = catchAsync(async (req, res, next) => {
  req.body.organizationId = req.user.organizationId;
  req.body.createdBy = req.user._id;
  req.body.updatedBy = req.user._id;
  
  await validateShiftGroupData(req.body, req.user.organizationId);
  
  const shiftGroup = await ShiftGroup.create(req.body);
  
  res.status(201).json({
    status: 'success',
    data: { shiftGroup }
  });
});

/**
 * @desc    Get all shift groups
 * @route   GET /api/v1/shift-groups
 * @access  Private
 */
exports.getAllShiftGroups = factory.getAll(ShiftGroup, {
  searchFields: ['name', 'code', 'description'],
  populate: [
    { path: 'shifts.shiftId', select: 'name code startTime endTime shiftType' }
  ]
});

/**
 * @desc    Get single shift group
 * @route   GET /api/v1/shift-groups/:id
 * @access  Private
 */
exports.getShiftGroup = factory.getOne(ShiftGroup, {
  populate: [
    { path: 'shifts.shiftId', select: 'name code startTime endTime shiftType duration' },
    { path: 'applicableDepartments', select: 'name' },
    { path: 'applicableDesignations', select: 'title' }
  ]
});

/**
 * @desc    Update shift group
 * @route   PATCH /api/v1/shift-groups/:id
 * @access  Private (Admin/HR)
 */
exports.updateShiftGroup = catchAsync(async (req, res, next) => {
  const group = await ShiftGroup.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!group) {
    return next(new AppError('Shift group not found', 404));
  }
  
  if (req.body.name || req.body.code) {
    await validateShiftGroupData(req.body, req.user.organizationId, req.params.id);
  }
  
  req.body.updatedBy = req.user._id;
  
  const updatedGroup = await ShiftGroup.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  
  res.status(200).json({
    status: 'success',
    data: { shiftGroup: updatedGroup }
  });
});

/**
 * @desc    Delete shift group (soft delete)
 * @route   DELETE /api/v1/shift-groups/:id
 * @access  Private (Admin only)
 */
exports.deleteShiftGroup = catchAsync(async (req, res, next) => {
  const group = await ShiftGroup.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!group) {
    return next(new AppError('Shift group not found', 404));
  }
  
  // Check if assigned to any users
  const assignedUsers = await User.countDocuments({
    organizationId: req.user.organizationId,
    'attendanceConfig.shiftGroupId': group._id,
    isActive: true
  });
  
  if (assignedUsers > 0) {
    return next(new AppError(
      `Cannot delete group assigned to ${assignedUsers} active users`,
      400
    ));
  }
  
  group.isActive = false;
  group.updatedBy = req.user._id;
  await group.save();
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// ======================================================
// SPECIALIZED OPERATIONS
// ======================================================

/**
 * @desc    Generate rotation schedule
 * @route   POST /api/v1/shift-groups/:id/generate-schedule
 * @access  Private
 */
exports.generateRotationSchedule = catchAsync(async (req, res, next) => {
  const { startDate, endDate, userIds } = req.body;
  
  const group = await ShiftGroup.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
    isActive: true
  }).populate('shifts.shiftId');
  
  if (!group) {
    return next(new AppError('Shift group not found', 404));
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  
  // Generate schedule based on rotation type
  const schedule = [];
  const shiftCount = group.shifts.length;
  
  for (let i = 0; i < days; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    
    let shiftIndex;
    
    switch (group.rotationType) {
      case 'daily':
        shiftIndex = i % shiftCount;
        break;
      case 'weekly':
        shiftIndex = Math.floor(i / 7) % shiftCount;
        break;
      case 'monthly':
        shiftIndex = Math.floor(i / 30) % shiftCount;
        break;
      default:
        // Custom pattern
        const pattern = group.rotationPattern?.find(p => p.dayOffset === i);
        shiftIndex = pattern ? 
          group.shifts.findIndex(s => s.shiftId._id.toString() === pattern.shiftId.toString()) :
          i % shiftCount;
    }
    
    if (shiftIndex >= 0 && shiftIndex < shiftCount) {
      schedule.push({
        date: currentDate,
        shift: group.shifts[shiftIndex].shiftId,
        dayNumber: i + 1
      });
    }
  }
  
  // If userIds provided, create assignments
  let assignments = [];
  if (userIds && userIds.length) {
    const ShiftAssignment = mongoose.model('ShiftAssignment');
    
    for (const userId of userIds) {
      for (const day of schedule) {
        assignments.push({
          user: userId,
          organizationId: req.user.organizationId,
          shiftId: day.shift._id,
          shiftGroupId: group._id,
          startDate: day.date,
          endDate: day.date,
          isTemporary: true,
          rotationSequence: day.dayNumber,
          assignedBy: req.user._id,
          status: 'active'
        });
      }
    }
    
    if (assignments.length) {
      assignments = await ShiftAssignment.insertMany(assignments);
    }
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      group: group.name,
      rotationType: group.rotationType,
      totalDays: days,
      schedule,
      assignments: assignments.length
    }
  });
});

/**
 * @desc    Assign group to users
 * @route   POST /api/v1/shift-groups/:id/assign
 * @access  Private
 */
exports.assignGroupToUsers = catchAsync(async (req, res, next) => {
  const { userIds, startDate, endDate } = req.body;
  
  if (!userIds || !userIds.length || !startDate) {
    return next(new AppError('Please provide userIds and startDate', 400));
  }
  
  const group = await ShiftGroup.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
    isActive: true
  });
  
  if (!group) {
    return next(new AppError('Shift group not found', 404));
  }
  
  // Validate users
  const validUsers = await User.find({
    _id: { $in: userIds },
    organizationId: req.user.organizationId,
    isActive: true
  }).select('_id');
  
  if (validUsers.length !== userIds.length) {
    return next(new AppError('One or more users are invalid or inactive', 400));
  }
  
  const ShiftAssignment = mongoose.model('ShiftAssignment');
  
  const assignments = await Promise.all(
    validUsers.map(async (user) => {
      // Deactivate existing assignments
      await ShiftAssignment.updateMany(
        {
          user: user._id,
          organizationId: req.user.organizationId,
          status: 'active'
        },
        {
          status: 'expired',
          endDate: new Date(startDate) - 1
        }
      );
      
      // Create new assignment
      return ShiftAssignment.create({
        user: user._id,
        organizationId: req.user.organizationId,
        shiftGroupId: group._id,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        assignedBy: req.user._id,
        status: 'active'
      });
    })
  );
  
  res.status(200).json({
    status: 'success',
    data: {
      group: group.name,
      assignedUsers: assignments.length,
      assignments
    }
  });
});

/**
 * @desc    Get group assignments
 * @route   GET /api/v1/shift-groups/:id/assignments
 * @access  Private
 */
exports.getGroupAssignments = catchAsync(async (req, res, next) => {
  const group = await ShiftGroup.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!group) {
    return next(new AppError('Shift group not found', 404));
  }
  
  const ShiftAssignment = mongoose.model('ShiftAssignment');
  
  const assignments = await ShiftAssignment.find({
    organizationId: req.user.organizationId,
    shiftGroupId: group._id,
    status: 'active'
  })
  .populate('user', 'name employeeProfile.employeeId employeeProfile.departmentId')
  .populate('shiftId', 'name code startTime endTime')
  .sort('startDate');
  
  res.status(200).json({
    status: 'success',
    results: assignments.length,
    data: { assignments }
  });
});