// controllers/core/shift.controller.js
const mongoose = require('mongoose');
const Shift = require('../../models/shift.model');
const ShiftGroup = require('../../models/shiftGroup.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError = require('../../../../core/utils/api/appError');
const factory = require('../../../../core/utils/api/handlerFactory');

// ======================================================
// HELPERS & VALIDATIONS
// ======================================================

const validateShiftData = async (data, organizationId, excludeId = null) => {
  const { name, code, startTime, endTime, minFullDayHrs, halfDayThresholdHrs } = data;
  
  // Check unique name
  const nameExists = await Shift.findOne({
    organizationId,
    name,
    _id: { $ne: excludeId }
  });
  if (nameExists) throw new AppError('Shift with this name already exists', 400);
  
  // Check unique code
  const codeExists = await Shift.findOne({
    organizationId,
    code,
    _id: { $ne: excludeId }
  });
  if (codeExists) throw new AppError('Shift with this code already exists', 400);
  
  // Validate times
  if (startTime && endTime) {
    const start = startTime.split(':').map(Number);
    const end = endTime.split(':').map(Number);
    const startMins = start[0] * 60 + start[1];
    const endMins = end[0] * 60 + end[1];
    
    let duration = endMins - startMins;
    if (duration < 0) duration += 24 * 60; // Cross midnight
    
    if (duration < 4 * 60) {
      throw new AppError('Shift duration must be at least 4 hours', 400);
    }
  }
  
  // Validate thresholds
  if (minFullDayHrs && halfDayThresholdHrs && minFullDayHrs <= halfDayThresholdHrs) {
    throw new AppError('Full day hours must be greater than half day threshold', 400);
  }
  
  // Validate breaks
  if (data.breaks && data.breaks.length) {
    for (const br of data.breaks) {
      if (br.startTime && br.endTime) {
        const start = br.startTime.split(':').map(Number);
        const end = br.endTime.split(':').map(Number);
        if (start[0] * 60 + start[1] >= end[0] * 60 + end[1]) {
          throw new AppError(`Break ${br.name} has invalid timing`, 400);
        }
      }
    }
  }
};

// ======================================================
// CRUD OPERATIONS
// ======================================================

/**
 * @desc    Create new shift
 * @route   POST /api/v1/shifts
 * @access  Private (Admin/HR)
 */
exports.createShift = catchAsync(async (req, res, next) => {
  // Set organization and audit fields
  req.body.organizationId = req.user.organizationId;
  req.body.createdBy = req.user._id;
  req.body.updatedBy = req.user._id;
  
  // Validate data
  await validateShiftData(req.body, req.user.organizationId);
  
  // Create shift
  const shift = await Shift.create(req.body);
  
  res.status(201).json({
    status: 'success',
    data: { shift }
  });
});

/**
 * @desc    Get all shifts
 * @route   GET /api/v1/shifts
 * @access  Private
 */
exports.getAllShifts = factory.getAll(Shift, {
  searchFields: ['name', 'code', 'description'],
  populate: [
    { path: 'createdBy', select: 'name' }
  ],
  sort: { shiftType: 1, startTime: 1 }
});

/**
 * @desc    Get single shift
 * @route   GET /api/v1/shifts/:id
 * @access  Private
 */
exports.getShift = factory.getOne(Shift, {
  populate: [
    { path: 'createdBy', select: 'name' },
    { path: 'updatedBy', select: 'name' }
  ]
});

/**
 * @desc    Update shift
 * @route   PATCH /api/v1/shifts/:id
 * @access  Private (Admin/HR)
 */
exports.updateShift = catchAsync(async (req, res, next) => {
  const shift = await Shift.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!shift) {
    return next(new AppError('Shift not found', 404));
  }
  
  // Validate updates
  if (req.body.name || req.body.code || req.body.startTime || req.body.endTime) {
    await validateShiftData(req.body, req.user.organizationId, req.params.id);
  }
  
  // Set audit field
  req.body.updatedBy = req.user._id;
  
  const updatedShift = await Shift.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  
  res.status(200).json({
    status: 'success',
    data: { shift: updatedShift }
  });
});

/**
 * @desc    Delete shift (soft delete)
 * @route   DELETE /api/v1/shifts/:id
 * @access  Private (Admin only)
 */
exports.deleteShift = catchAsync(async (req, res, next) => {
  const shift = await Shift.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!shift) {
    return next(new AppError('Shift not found', 404));
  }
  
  // Check if shift is assigned to users
  const assignedUsers = await User.countDocuments({
    organizationId: req.user.organizationId,
    'attendanceConfig.shiftId': shift._id,
    isActive: true
  });
  
  if (assignedUsers > 0) {
    return next(new AppError(
      `Cannot delete shift assigned to ${assignedUsers} active users`,
      400
    ));
  }
  
  // Check if in shift groups
  const inGroups = await ShiftGroup.countDocuments({
    organizationId: req.user.organizationId,
    'shifts.shiftId': shift._id,
    isActive: true
  });
  
  if (inGroups > 0) {
    return next(new AppError(
      'Cannot delete shift as it is part of active shift groups',
      400
    ));
  }
  
  // Soft delete
  shift.isActive = false;
  shift.updatedBy = req.user._id;
  await shift.save();
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// ======================================================
// SPECIALIZED OPERATIONS
// ======================================================

/**
 * @desc    Get shift assignments
 * @route   GET /api/v1/shifts/:id/assignments
 * @access  Private
 */
exports.getShiftAssignments = catchAsync(async (req, res, next) => {
  const shift = await Shift.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!shift) {
    return next(new AppError('Shift not found', 404));
  }
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  const query = {
    organizationId: req.user.organizationId,
    'attendanceConfig.shiftId': shift._id,
    isActive: true
  };
  
  const [users, total] = await Promise.all([
    User.find(query)
      .select('name employeeProfile.employeeId employeeProfile.departmentId attendanceConfig')
      .populate('employeeProfile.departmentId', 'name')
      .skip(skip)
      .limit(limit)
      .sort('name'),
    User.countDocuments(query)
  ]);
  
  res.status(200).json({
    status: 'success',
    results: users.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: { users }
  });
});

/**
 * @desc    Calculate shift hours
 * @route   POST /api/v1/shifts/calculate-hours
 * @access  Private
 */
exports.calculateShiftHours = catchAsync(async (req, res, next) => {
  const { startTime, endTime, breaks = [] } = req.body;
  
  if (!startTime || !endTime) {
    return next(new AppError('Please provide start and end time', 400));
  }
  
  // Parse times
  const start = startTime.split(':').map(Number);
  const end = endTime.split(':').map(Number);
  let startMins = start[0] * 60 + start[1];
  let endMins = end[0] * 60 + end[1];
  
  // Calculate total duration
  let totalMins = endMins - startMins;
  if (totalMins < 0) totalMins += 24 * 60;
  
  // Subtract breaks
  let breakMins = 0;
  breaks.forEach(br => {
    if (br.startTime && br.endTime) {
      const brStart = br.startTime.split(':').map(Number);
      const brEnd = br.endTime.split(':').map(Number);
      let brMins = (brEnd[0] * 60 + brEnd[1]) - (brStart[0] * 60 + brStart[1]);
      if (brMins < 0) brMins += 24 * 60;
      breakMins += brMins;
    }
  });
  
  const workMins = totalMins - breakMins;
  
  res.status(200).json({
    status: 'success',
    data: {
      totalHours: (totalMins / 60).toFixed(2),
      breakHours: (breakMins / 60).toFixed(2),
      workHours: (workMins / 60).toFixed(2),
      crossesMidnight: endMins < startMins
    }
  });
});

/**
 * @desc    Get shift coverage
 * @route   GET /api/v1/shifts/coverage
 * @access  Private
 */
exports.getShiftCoverage = catchAsync(async (req, res, next) => {
  const { date } = req.query;
  const targetDate = date ? new Date(date) : new Date();
  
  // Get all active shifts
  const shifts = await Shift.find({
    organizationId: req.user.organizationId,
    isActive: true
  }).lean();
  
  // Get users per shift
  const coverage = await Promise.all(
    shifts.map(async (shift) => {
      const count = await User.countDocuments({
        organizationId: req.user.organizationId,
        'attendanceConfig.shiftId': shift._id,
        isActive: true,
        status: 'approved'
      });
      
      // Check if it's a working day for this shift
      const dayOfWeek = targetDate.getDay();
      const isWorkingDay = !shift.weeklyOffs?.includes(dayOfWeek);
      
      return {
        shift: {
          _id: shift._id,
          name: shift.name,
          code: shift.code,
          startTime: shift.startTime,
          endTime: shift.endTime
        },
        assignedUsers: count,
        isWorkingDay,
        status: isWorkingDay ? 'scheduled' : 'off'
      };
    })
  );
  
  res.status(200).json({
    status: 'success',
    data: { coverage }
  });
});

/**
 * @desc    Clone shift
 * @route   POST /api/v1/shifts/:id/clone
 * @access  Private (Admin)
 */
exports.cloneShift = catchAsync(async (req, res, next) => {
  const sourceShift = await Shift.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!sourceShift) {
    return next(new AppError('Source shift not found', 404));
  }
  
  // Create clone data
  const cloneData = sourceShift.toObject();
  delete cloneData._id;
  delete cloneData.createdAt;
  delete cloneData.updatedAt;
  delete cloneData.createdBy;
  delete cloneData.updatedBy;
  
  // Modify name to indicate clone
  cloneData.name = `${cloneData.name} (Copy)`;
  cloneData.code = `${cloneData.code}_COPY`;
  cloneData.organizationId = req.user.organizationId;
  cloneData.createdBy = req.user._id;
  cloneData.updatedBy = req.user._id;
  
  // Validate and create
  await validateShiftData(cloneData, req.user.organizationId);
  
  const newShift = await Shift.create(cloneData);
  
  res.status(201).json({
    status: 'success',
    data: { shift: newShift }
  });
});

/**
 * @desc    Get shift timeline
 * @route   GET /api/v1/shifts/timeline
 * @access  Private
 */
exports.getShiftTimeline = catchAsync(async (req, res, next) => {
  const { date } = req.query;
  const targetDate = date ? new Date(date) : new Date();
  
  const shifts = await Shift.find({
    organizationId: req.user.organizationId,
    isActive: true
  }).lean();
  
  const timeline = shifts.map(shift => {
    const start = new Date(targetDate);
    const [startHour, startMin] = shift.startTime.split(':').map(Number);
    start.setHours(startHour, startMin, 0);
    
    const end = new Date(targetDate);
    const [endHour, endMin] = shift.endTime.split(':').map(Number);
    end.setHours(endHour, endMin, 0);
    
    if (shift.crossesMidnight) {
      end.setDate(end.getDate() + 1);
    }
    
    return {
      shift: {
        _id: shift._id,
        name: shift.name,
        code: shift.code,
        type: shift.shiftType
      },
      startTime: start,
      endTime: end,
      duration: shift.duration,
      isNightShift: shift.isNightShift
    };
  });
  
  // Sort by start time
  timeline.sort((a, b) => a.startTime - b.startTime);
  
  res.status(200).json({
    status: 'success',
    data: { timeline }
  });
});

/**
 * @desc    Validate shift assignment
 * @route   POST /api/v1/shifts/validate-assignment
 * @access  Private
 */
exports.validateShiftAssignment = catchAsync(async (req, res, next) => {
  const { shiftId, userId, date } = req.body;
  
  const shift = await Shift.findOne({
    _id: shiftId,
    organizationId: req.user.organizationId,
    isActive: true
  });
  
  if (!shift) {
    return next(new AppError('Shift not found', 404));
  }
  
  const targetDate = date ? new Date(date) : new Date();
  const dayOfWeek = targetDate.getDay();
  
  // Check if working day
  const isWorkingDay = !shift.weeklyOffs?.includes(dayOfWeek);
  
  // Check if user already has shift
  const user = await User.findById(userId);
  const currentShiftId = user?.attendanceConfig?.shiftId;
  
  const warnings = [];
  
  if (!isWorkingDay) {
    warnings.push('Selected date is a weekly off for this shift');
  }
  
  if (currentShiftId && currentShiftId.toString() !== shiftId) {
    warnings.push('User already assigned to a different shift');
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      isValid: warnings.length === 0,
      warnings,
      shift: {
        name: shift.name,
        timing: `${shift.startTime} - ${shift.endTime}`,
        isWorkingDay
      }
    }
  });
});