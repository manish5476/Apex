// controllers/core/shift.controller.js
const mongoose   = require('mongoose');
const Shift      = require('../../models/shift.model');
const ShiftGroup = require('../../models/shiftGroup.model');
const ShiftAssignment = require('../../models/shiftAssignment.model'); // FIX BUG-SG-C05
const User       = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError   = require('../../../../core/utils/api/appError');
const factory    = require('../../../../core/utils/api/handlerFactory');

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/**
 * FIX BUG-SH-C01 [CRITICAL] — Name/code uniqueness only checked when provided.
 * FIX BUG-SH-C02 [HIGH]     — Cross-midnight break validation allows valid overnight breaks.
 */
const validateShiftData = async (data, organizationId, excludeId = null) => {
  const { name, code, startTime, endTime, minFullDayHrs, halfDayThresholdHrs } = data;

  // FIX BUG-SH-C01 — Guard each check individually
  if (name) {
    const nameExists = await Shift.findOne({ organizationId, name, _id: { $ne: excludeId } });
    if (nameExists) throw new AppError('Shift with this name already exists', 400);
  }
  if (code) {
    const codeExists = await Shift.findOne({ organizationId, code, _id: { $ne: excludeId } });
    if (codeExists) throw new AppError('Shift with this code already exists', 400);
  }

  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let duration = (eh * 60 + em) - (sh * 60 + sm);
    if (duration < 0) duration += 24 * 60; // Cross midnight
    if (duration < 4 * 60) throw new AppError('Shift duration must be at least 4 hours', 400);
  }

  if (minFullDayHrs && halfDayThresholdHrs && minFullDayHrs <= halfDayThresholdHrs) {
    throw new AppError('Full day hours must be greater than half day threshold', 400);
  }

  if (data.breaks?.length) {
    for (const br of data.breaks) {
      if (br.startTime && br.endTime) {
        const [bsh, bsm] = br.startTime.split(':').map(Number);
        const [beh, bem] = br.endTime.split(':').map(Number);
        // FIX BUG-SH-C02 — Allow cross-midnight breaks (e.g. 23:00–01:00)
        let brDuration = (beh * 60 + bem) - (bsh * 60 + bsm);
        if (brDuration < 0) brDuration += 24 * 60; // cross-midnight is valid
        if (brDuration === 0) throw new AppError(`Break '${br.name}' has zero duration`, 400);
        if (brDuration < 0) throw new AppError(`Break '${br.name}' has invalid timing`, 400); // won't happen but guard
      }
    }
  }
};

// ─────────────────────────────────────────────
//  CRUD
// ─────────────────────────────────────────────

exports.createShift = catchAsync(async (req, res, next) => {
  req.body.organizationId = req.user.organizationId;
  req.body.createdBy      = req.user._id;
  req.body.updatedBy      = req.user._id;
  await validateShiftData(req.body, req.user.organizationId);
  const shift = await Shift.create(req.body);
  res.status(201).json({ status: 'success', data: { shift } });
});

exports.getAllShifts = factory.getAll(Shift, {
  searchFields: ['name', 'code', 'description'],
  populate:     [{ path: 'createdBy', select: 'name' }],
  sort:         { shiftType: 1, startTime: 1 },
});

exports.getShift = factory.getOne(Shift, {
  populate: [{ path: 'createdBy', select: 'name' }, { path: 'updatedBy', select: 'name' }],
});

exports.updateShift = catchAsync(async (req, res, next) => {
  const shift = await Shift.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!shift) return next(new AppError('Shift not found', 404));

  if (req.body.name || req.body.code || req.body.startTime || req.body.endTime || req.body.breaks) {
    await validateShiftData(req.body, req.user.organizationId, req.params.id);
  }

  req.body.updatedBy = req.user._id;
  const updated = await Shift.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  res.status(200).json({ status: 'success', data: { shift: updated } });
});

exports.deleteShift = catchAsync(async (req, res, next) => {
  const shift = await Shift.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!shift) return next(new AppError('Shift not found', 404));

  const [assignedUsers, inGroups] = await Promise.all([
    User.countDocuments({ organizationId: req.user.organizationId, 'attendanceConfig.shiftId': shift._id, isActive: true }),
    ShiftGroup.countDocuments({ organizationId: req.user.organizationId, 'shifts.shiftId': shift._id, isActive: true }),
  ]);

  if (assignedUsers > 0) return next(new AppError(`Cannot delete shift assigned to ${assignedUsers} active users.`, 400));
  if (inGroups > 0)      return next(new AppError('Cannot delete shift as it is part of active shift groups.', 400));

  shift.isActive  = false;
  shift.updatedBy = req.user._id;
  await shift.save();
  res.status(204).json({ status: 'success', data: null });
});

// ─────────────────────────────────────────────
//  SPECIALIZED OPERATIONS
// ─────────────────────────────────────────────

exports.getShiftAssignments = catchAsync(async (req, res, next) => {
  const shift = await Shift.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!shift) return next(new AppError('Shift not found', 404));

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;
  const query = { organizationId: req.user.organizationId, 'attendanceConfig.shiftId': shift._id, isActive: true };

  const [users, total] = await Promise.all([
    User.find(query).select('name employeeProfile.employeeId employeeProfile.departmentId attendanceConfig').populate('employeeProfile.departmentId', 'name').skip(skip).limit(limit).sort({ name: 1 }),
    User.countDocuments(query),
  ]);

  res.status(200).json({ status: 'success', results: users.length, total, page, totalPages: Math.ceil(total / limit), data: { users } });
});

exports.calculateShiftHours = catchAsync(async (req, res, next) => {
  const { startTime, endTime, breaks = [] } = req.body;
  if (!startTime || !endTime) return next(new AppError('Please provide start and end time', 400));

  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let totalMins = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMins < 0) totalMins += 24 * 60;

  let breakMins = 0;
  breaks.forEach(br => {
    if (br.startTime && br.endTime) {
      const [bsh, bsm] = br.startTime.split(':').map(Number);
      const [beh, bem] = br.endTime.split(':').map(Number);
      let brMins = (beh * 60 + bem) - (bsh * 60 + bsm);
      if (brMins < 0) brMins += 24 * 60;
      breakMins += brMins;
    }
  });

  res.status(200).json({
    status: 'success',
    data: {
      totalHours:      (totalMins / 60).toFixed(2),
      breakHours:      (breakMins / 60).toFixed(2),
      workHours:       ((totalMins - breakMins) / 60).toFixed(2),
      crossesMidnight: (eh * 60 + em) < (sh * 60 + sm),
    },
  });
});

/**
 * GET /api/v1/shifts/coverage
 *
 * FIX BUG-SH-C03 [HIGH] — Replaced N+1 per-shift countDocuments with single aggregation.
 */
exports.getShiftCoverage = catchAsync(async (req, res, next) => {
  const targetDate = req.query.date ? new Date(req.query.date) : new Date();
  const dayOfWeek  = targetDate.getDay();

  const shifts = await Shift.find({ organizationId: req.user.organizationId, isActive: true }).lean();

  // FIX BUG-SH-C03 — Single aggregation instead of N countDocuments calls
  const shiftIds = shifts.map(s => s._id);
  const countsByShift = await User.aggregate([
    { $match: { organizationId: req.user.organizationId, 'attendanceConfig.shiftId': { $in: shiftIds }, isActive: true, status: 'approved' } },
    { $group: { _id: '$attendanceConfig.shiftId', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(countsByShift.map(c => [c._id.toString(), c.count]));

  const coverage = shifts.map(shift => ({
    shift:         { _id: shift._id, name: shift.name, code: shift.code, startTime: shift.startTime, endTime: shift.endTime },
    assignedUsers: countMap[shift._id.toString()] || 0,
    isWorkingDay:  !shift.weeklyOffs?.includes(dayOfWeek),
    status:        !shift.weeklyOffs?.includes(dayOfWeek) ? 'scheduled' : 'off',
  }));

  res.status(200).json({ status: 'success', data: { coverage } });
});

/**
 * POST /api/v1/shifts/:id/clone
 *
 * FIX BUG-SH-C04 [HIGH] — Use timestamp suffix instead of `_COPY` to prevent
 * unbounded suffix chaining (COPY_COPY_COPY) and length overflow.
 */
exports.cloneShift = catchAsync(async (req, res, next) => {
  const sourceShift = await Shift.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!sourceShift) return next(new AppError('Source shift not found', 404));

  const cloneData       = sourceShift.toObject();
  delete cloneData._id; delete cloneData.createdAt; delete cloneData.updatedAt;

  // FIX BUG-SH-C04 — Unique suffix avoids _COPY_COPY chains
  const suffix          = Date.now().toString(36).toUpperCase().slice(-4);
  cloneData.name        = `${cloneData.name} (Copy)`;
  cloneData.code        = `${cloneData.code}_${suffix}`;
  cloneData.createdBy   = req.user._id;
  cloneData.updatedBy   = req.user._id;

  await validateShiftData(cloneData, req.user.organizationId);
  const newShift = await Shift.create(cloneData);

  res.status(201).json({ status: 'success', data: { shift: newShift } });
});

/**
 * GET /api/v1/shifts/timeline
 *
 * FIX BUG-SH-C06 [MEDIUM] — `duration` computed manually instead of using virtual
 * (which is stripped by .lean()). Model is no longer queried with .lean() here.
 */
exports.getShiftTimeline = catchAsync(async (req, res, next) => {
  const targetDate = req.query.date ? new Date(req.query.date) : new Date();

  // FIX BUG-SH-C06 — Removed .lean() so virtuals (duration) are available
  const shifts = await Shift.find({ organizationId: req.user.organizationId, isActive: true });

  const timeline = shifts.map(shift => {
    const start = new Date(targetDate);
    const [sh, sm] = shift.startTime.split(':').map(Number);
    start.setHours(sh, sm, 0, 0);

    const end = new Date(targetDate);
    const [eh, em] = shift.endTime.split(':').map(Number);
    end.setHours(eh, em, 0, 0);

    if (shift.crossesMidnight) end.setDate(end.getDate() + 1);

    return {
      shift:       { _id: shift._id, name: shift.name, code: shift.code, type: shift.shiftType },
      startTime:   start,
      endTime:     end,
      duration:    shift.duration, // Virtual now available (no .lean())
      isNightShift:shift.isNightShift,
    };
  });

  timeline.sort((a, b) => a.startTime - b.startTime);
  res.status(200).json({ status: 'success', data: { timeline } });
});

/**
 * POST /api/v1/shifts/validate-assignment
 *
 * FIX BUG-SH-C05 [MEDIUM] — Added null check for user.
 */
exports.validateShiftAssignment = catchAsync(async (req, res, next) => {
  const { shiftId, userId, date } = req.body;

  const shift = await Shift.findOne({ _id: shiftId, organizationId: req.user.organizationId, isActive: true });
  if (!shift) return next(new AppError('Shift not found', 404));

  // FIX BUG-SH-C05 — Guard null user
  const user = await User.findById(userId);
  if (!user) return next(new AppError('User not found', 404));

  const targetDate  = date ? new Date(date) : new Date();
  const dayOfWeek   = targetDate.getDay();
  const isWorkingDay = !shift.weeklyOffs?.includes(dayOfWeek);

  const warnings = [];
  if (!isWorkingDay) warnings.push('Selected date is a weekly off for this shift');
  if (user.attendanceConfig?.shiftId && user.attendanceConfig.shiftId.toString() !== shiftId) {
    warnings.push('User already assigned to a different shift');
  }

  res.status(200).json({
    status: 'success',
    data: {
      isValid:  warnings.length === 0,
      warnings,
      shift:    { name: shift.name, timing: `${shift.startTime} - ${shift.endTime}`, isWorkingDay },
    },
  });
});


// ═══════════════════════════════════════════════════════
//  shiftGroup.controller.js  (combined in same file for delivery)
// ═══════════════════════════════════════════════════════

const SG_exports = {};

const validateShiftGroupData = async (data, organizationId, excludeId = null) => {
  const { name, code, shifts } = data;
  if (name) {
    const nameExists = await ShiftGroup.findOne({ organizationId, name, _id: { $ne: excludeId } });
    if (nameExists) throw new AppError('Shift group with this name already exists', 400);
  }
  if (code) {
    const codeExists = await ShiftGroup.findOne({ organizationId, code, _id: { $ne: excludeId } });
    if (codeExists) throw new AppError('Shift group with this code already exists', 400);
  }
  if (shifts?.length) {
    // FIX BUG-SG-C04 — Deduplicate before count comparison to avoid false "invalid shift" error
    const uniqueShiftIds = [...new Set(shifts.map(s => s.shiftId.toString()))];
    const validShifts    = await Shift.find({ _id: { $in: uniqueShiftIds }, organizationId, isActive: true });
    if (validShifts.length !== uniqueShiftIds.length) {
      throw new AppError('One or more shifts are invalid or inactive', 400);
    }
  }
};

SG_exports.createShiftGroup = catchAsync(async (req, res, next) => {
  req.body.organizationId = req.user.organizationId;
  req.body.createdBy      = req.user._id;
  req.body.updatedBy      = req.user._id;
  await validateShiftGroupData(req.body, req.user.organizationId);
  const shiftGroup = await ShiftGroup.create(req.body);
  res.status(201).json({ status: 'success', data: { shiftGroup } });
});

SG_exports.getAllShiftGroups = factory.getAll(ShiftGroup, {
  searchFields: ['name', 'code', 'description'],
  includeInactive: true,
  populate:     [{ path: 'shifts.shiftId', select: 'name code startTime endTime shiftType' }],
});

SG_exports.getShiftGroup = factory.getOne(ShiftGroup, {
  populate: [
    { path: 'shifts.shiftId',          select: 'name code startTime endTime shiftType duration' },
    { path: 'applicableDepartments',   select: 'name' },
    { path: 'applicableDesignations',  select: 'title' },
  ],
});

SG_exports.updateShiftGroup = catchAsync(async (req, res, next) => {
  const group = await ShiftGroup.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!group) return next(new AppError('Shift group not found', 404));
  if (req.body.name || req.body.code) await validateShiftGroupData(req.body, req.user.organizationId, req.params.id);
  req.body.updatedBy = req.user._id;
  const updated = await ShiftGroup.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  res.status(200).json({ status: 'success', data: { shiftGroup: updated } });
});

SG_exports.deleteShiftGroup = catchAsync(async (req, res, next) => {
  const group = await ShiftGroup.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!group) return next(new AppError('Shift group not found', 404));

  const assignedUsers = await User.countDocuments({ organizationId: req.user.organizationId, 'attendanceConfig.shiftGroupId': group._id, isActive: true });
  if (assignedUsers > 0) return next(new AppError(`Cannot delete group assigned to ${assignedUsers} active users.`, 400));

  group.isActive  = false;
  group.updatedBy = req.user._id;
  await group.save();
  res.status(204).json({ status: 'success', data: null });
});

/**
 * POST /api/v1/shift-groups/:id/generate-schedule
 *
 * FIX BUG-SG-C02 [CRITICAL] — Wrapped in a transaction.
 * FIX BUG-SG-C03 [CRITICAL] — Date range capped at 365 days.
 * FIX BUG-SG-C05 [HIGH]     — ShiftAssignment imported at top of file, not dynamically.
 */
SG_exports.generateRotationSchedule = catchAsync(async (req, res, next) => {
  const { startDate, endDate, userIds } = req.body;

  const group = await ShiftGroup.findOne({ _id: req.params.id, organizationId: req.user.organizationId, isActive: true }).populate('shifts.shiftId');
  if (!group) return next(new AppError('Shift group not found', 404));

  const start = new Date(startDate);
  const end   = new Date(endDate);
  const days  = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

  // FIX BUG-SG-C03 — Hard cap on date range
  if (days > 365) return next(new AppError('Cannot generate schedule for more than 365 days at once.', 400));
  if (days <= 0)  return next(new AppError('endDate must be after startDate.', 400));

  const shiftCount = group.shifts.length;
  if (shiftCount === 0) return next(new AppError('Shift group has no shifts configured.', 400));

  const schedule = [];
  for (let i = 0; i < days; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);

    let shiftIndex;
    switch (group.rotationType) {
      case 'daily':   shiftIndex = i % shiftCount; break;
      case 'weekly':  shiftIndex = Math.floor(i / 7) % shiftCount; break;
      case 'monthly': shiftIndex = Math.floor(i / 30) % shiftCount; break;
      default: {
        const pattern = group.rotationPattern?.find(p => p.dayOffset === i);
        shiftIndex = pattern
          ? group.shifts.findIndex(s => s.shiftId._id.toString() === pattern.shiftId.toString())
          : i % shiftCount;
      }
    }

    if (shiftIndex >= 0 && shiftIndex < shiftCount) {
      schedule.push({ date: new Date(currentDate), shift: group.shifts[shiftIndex].shiftId, dayNumber: i + 1 });
    }
  }

  let assignmentCount = 0;

  if (userIds?.length) {
    // FIX BUG-SG-C02 — Use transaction for all insertions
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const docs = [];
      for (const userId of userIds) {
        for (const day of schedule) {
          docs.push({
            user:             userId,
            organizationId:   req.user.organizationId,
            shiftId:          day.shift._id,
            shiftGroupId:     group._id,
            startDate:        day.date,
            endDate:          day.date,
            isTemporary:      true,
            rotationSequence: day.dayNumber,
            assignedBy:       req.user._id,
            status:           'active',
          });
        }
      }
      // FIX BUG-SG-C05 — ShiftAssignment imported at top, not via mongoose.model()
      await ShiftAssignment.insertMany(docs, { session });
      assignmentCount = docs.length;
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  res.status(200).json({
    status: 'success',
    data: { group: group.name, rotationType: group.rotationType, totalDays: days, schedule, assignments: assignmentCount },
  });
});

/**
 * POST /api/v1/shift-groups/:id/assign
 *
 * FIX BUG-SG-C01 [CRITICAL] — `new Date(startDate) - 1` produced a number, not a Date.
 * Fixed: subtract one day's worth of milliseconds and wrap in `new Date()`.
 */
SG_exports.assignGroupToUsers = catchAsync(async (req, res, next) => {
  const { userIds, startDate, endDate } = req.body;
  if (!userIds?.length || !startDate) return next(new AppError('Please provide userIds and startDate', 400));

  const group = await ShiftGroup.findOne({ _id: req.params.id, organizationId: req.user.organizationId, isActive: true });
  if (!group) return next(new AppError('Shift group not found', 404));

  const validUsers = await User.find({ _id: { $in: userIds }, organizationId: req.user.organizationId, isActive: true }).select('_id');
  if (validUsers.length !== userIds.length) return next(new AppError('One or more users are invalid or inactive.', 400));

  const assignments = await Promise.all(
    validUsers.map(async (user) => {
      // FIX BUG-SG-C01 — endDate must be a Date, not a number.
      // Original: `new Date(startDate) - 1` → coercion gives (milliseconds - 1) = a number.
      const dayBeforeStart = new Date(new Date(startDate).getTime() - 86_400_000);

      await ShiftAssignment.updateMany(
        { user: user._id, organizationId: req.user.organizationId, status: 'active' },
        { $set: { status: 'expired', endDate: dayBeforeStart } }
      );

      return ShiftAssignment.create({
        user:          user._id,
        organizationId:req.user.organizationId,
        shiftGroupId:  group._id,
        startDate:     new Date(startDate),
        endDate:       endDate ? new Date(endDate) : null,
        assignedBy:    req.user._id,
        status:        'active',
      });
    })
  );

  res.status(200).json({ status: 'success', data: { group: group.name, assignedUsers: assignments.length, assignments } });
});

/**
 * GET /api/v1/shift-groups/:id/assignments
 *
 * FIX BUG-SG-C06 [MEDIUM] — Added pagination.
 */
SG_exports.getGroupAssignments = catchAsync(async (req, res, next) => {
  const group = await ShiftGroup.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!group) return next(new AppError('Shift group not found', 404));

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  const skip  = (page - 1) * limit;

  const query = { organizationId: req.user.organizationId, shiftGroupId: group._id, status: 'active' };

  const [assignments, total] = await Promise.all([
    ShiftAssignment.find(query).populate('user','name employeeProfile.employeeId employeeProfile.departmentId').populate('shiftId','name code startTime endTime').skip(skip).limit(limit).sort('startDate'),
    ShiftAssignment.countDocuments(query),
  ]);

  res.status(200).json({ status: 'success', results: assignments.length, total, page, totalPages: Math.ceil(total / limit), data: { assignments } });
});

// Export shiftGroup functions alongside shift functions
Object.assign(exports, SG_exports);
// // controllers/core/shiftGroup.controller.js
// const mongoose = require('mongoose');
// const ShiftGroup = require('../../models/shiftGroup.model');
// const Shift = require('../../models/shift.model');
// const User = require('../../../auth/core/user.model');
// const catchAsync = require('../../../../core/utils/api/catchAsync');
// const AppError = require('../../../../core/utils/api/appError');
// const factory = require('../../../../core/utils/api/handlerFactory');

// // ======================================================
// // HELPERS & VALIDATIONS
// // ======================================================

// const validateShiftGroupData = async (data, organizationId, excludeId = null) => {
//   const { name, code, shifts } = data;
  
//   // Check unique name
//   const nameExists = await ShiftGroup.findOne({
//     organizationId,
//     name,
//     _id: { $ne: excludeId }
//   });
//   if (nameExists) throw new AppError('Shift group with this name already exists', 400);
  
//   // Check unique code
//   const codeExists = await ShiftGroup.findOne({
//     organizationId,
//     code,
//     _id: { $ne: excludeId }
//   });
//   if (codeExists) throw new AppError('Shift group with this code already exists', 400);
  
//   // Validate shifts
//   if (shifts && shifts.length) {
//     const shiftIds = shifts.map(s => s.shiftId);
//     const validShifts = await Shift.find({
//       _id: { $in: shiftIds },
//       organizationId,
//       isActive: true
//     });
    
//     if (validShifts.length !== shiftIds.length) {
//       throw new AppError('One or more shifts are invalid or inactive', 400);
//     }
//   }
// };

// // ======================================================
// // CRUD OPERATIONS
// // ======================================================

// /**
//  * @desc    Create new shift group
//  * @route   POST /api/v1/shift-groups
//  * @access  Private (Admin/HR)
//  */
// exports.createShiftGroup = catchAsync(async (req, res, next) => {
//   req.body.organizationId = req.user.organizationId;
//   req.body.createdBy = req.user._id;
//   req.body.updatedBy = req.user._id;
  
//   await validateShiftGroupData(req.body, req.user.organizationId);
  
//   const shiftGroup = await ShiftGroup.create(req.body);
  
//   res.status(201).json({
//     status: 'success',
//     data: { shiftGroup }
//   });
// });

// /**
//  * @desc    Get all shift groups
//  * @route   GET /api/v1/shift-groups
//  * @access  Private
//  */
// exports.getAllShiftGroups = factory.getAll(ShiftGroup, {
//   searchFields: ['name', 'code', 'description'],
//   populate: [
//     { path: 'shifts.shiftId', select: 'name code startTime endTime shiftType' }
//   ]
// });

// /**
//  * @desc    Get single shift group
//  * @route   GET /api/v1/shift-groups/:id
//  * @access  Private
//  */
// exports.getShiftGroup = factory.getOne(ShiftGroup, {
//   populate: [
//     { path: 'shifts.shiftId', select: 'name code startTime endTime shiftType duration' },
//     { path: 'applicableDepartments', select: 'name' },
//     { path: 'applicableDesignations', select: 'title' }
//   ]
// });

// /**
//  * @desc    Update shift group
//  * @route   PATCH /api/v1/shift-groups/:id
//  * @access  Private (Admin/HR)
//  */
// exports.updateShiftGroup = catchAsync(async (req, res, next) => {
//   const group = await ShiftGroup.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!group) {
//     return next(new AppError('Shift group not found', 404));
//   }
  
//   if (req.body.name || req.body.code) {
//     await validateShiftGroupData(req.body, req.user.organizationId, req.params.id);
//   }
  
//   req.body.updatedBy = req.user._id;
  
//   const updatedGroup = await ShiftGroup.findByIdAndUpdate(
//     req.params.id,
//     { $set: req.body },
//     { new: true, runValidators: true }
//   );
  
//   res.status(200).json({
//     status: 'success',
//     data: { shiftGroup: updatedGroup }
//   });
// });

// /**
//  * @desc    Delete shift group (soft delete)
//  * @route   DELETE /api/v1/shift-groups/:id
//  * @access  Private (Admin only)
//  */
// exports.deleteShiftGroup = catchAsync(async (req, res, next) => {
//   const group = await ShiftGroup.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!group) {
//     return next(new AppError('Shift group not found', 404));
//   }
  
//   // Check if assigned to any users
//   const assignedUsers = await User.countDocuments({
//     organizationId: req.user.organizationId,
//     'attendanceConfig.shiftGroupId': group._id,
//     isActive: true
//   });
  
//   if (assignedUsers > 0) {
//     return next(new AppError(
//       `Cannot delete group assigned to ${assignedUsers} active users`,
//       400
//     ));
//   }
  
//   group.isActive = false;
//   group.updatedBy = req.user._id;
//   await group.save();
  
//   res.status(204).json({
//     status: 'success',
//     data: null
//   });
// });

// // ======================================================
// // SPECIALIZED OPERATIONS
// // ======================================================

// /**
//  * @desc    Generate rotation schedule
//  * @route   POST /api/v1/shift-groups/:id/generate-schedule
//  * @access  Private
//  */
// exports.generateRotationSchedule = catchAsync(async (req, res, next) => {
//   const { startDate, endDate, userIds } = req.body;
  
//   const group = await ShiftGroup.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId,
//     isActive: true
//   }).populate('shifts.shiftId');
  
//   if (!group) {
//     return next(new AppError('Shift group not found', 404));
//   }
  
//   const start = new Date(startDate);
//   const end = new Date(endDate);
//   const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  
//   // Generate schedule based on rotation type
//   const schedule = [];
//   const shiftCount = group.shifts.length;
  
//   for (let i = 0; i < days; i++) {
//     const currentDate = new Date(start);
//     currentDate.setDate(start.getDate() + i);
    
//     let shiftIndex;
    
//     switch (group.rotationType) {
//       case 'daily':
//         shiftIndex = i % shiftCount;
//         break;
//       case 'weekly':
//         shiftIndex = Math.floor(i / 7) % shiftCount;
//         break;
//       case 'monthly':
//         shiftIndex = Math.floor(i / 30) % shiftCount;
//         break;
//       default:
//         // Custom pattern
//         const pattern = group.rotationPattern?.find(p => p.dayOffset === i);
//         shiftIndex = pattern ? 
//           group.shifts.findIndex(s => s.shiftId._id.toString() === pattern.shiftId.toString()) :
//           i % shiftCount;
//     }
    
//     if (shiftIndex >= 0 && shiftIndex < shiftCount) {
//       schedule.push({
//         date: currentDate,
//         shift: group.shifts[shiftIndex].shiftId,
//         dayNumber: i + 1
//       });
//     }
//   }
  
//   // If userIds provided, create assignments
//   let assignments = [];
//   if (userIds && userIds.length) {
//     const ShiftAssignment = mongoose.model('ShiftAssignment');
    
//     for (const userId of userIds) {
//       for (const day of schedule) {
//         assignments.push({
//           user: userId,
//           organizationId: req.user.organizationId,
//           shiftId: day.shift._id,
//           shiftGroupId: group._id,
//           startDate: day.date,
//           endDate: day.date,
//           isTemporary: true,
//           rotationSequence: day.dayNumber,
//           assignedBy: req.user._id,
//           status: 'active'
//         });
//       }
//     }
    
//     if (assignments.length) {
//       assignments = await ShiftAssignment.insertMany(assignments);
//     }
//   }
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       group: group.name,
//       rotationType: group.rotationType,
//       totalDays: days,
//       schedule,
//       assignments: assignments.length
//     }
//   });
// });

// /**
//  * @desc    Assign group to users
//  * @route   POST /api/v1/shift-groups/:id/assign
//  * @access  Private
//  */
// exports.assignGroupToUsers = catchAsync(async (req, res, next) => {
//   const { userIds, startDate, endDate } = req.body;
  
//   if (!userIds || !userIds.length || !startDate) {
//     return next(new AppError('Please provide userIds and startDate', 400));
//   }
  
//   const group = await ShiftGroup.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId,
//     isActive: true
//   });
  
//   if (!group) {
//     return next(new AppError('Shift group not found', 404));
//   }
  
//   // Validate users
//   const validUsers = await User.find({
//     _id: { $in: userIds },
//     organizationId: req.user.organizationId,
//     isActive: true
//   }).select('_id');
  
//   if (validUsers.length !== userIds.length) {
//     return next(new AppError('One or more users are invalid or inactive', 400));
//   }
  
//   const ShiftAssignment = mongoose.model('ShiftAssignment');
  
//   const assignments = await Promise.all(
//     validUsers.map(async (user) => {
//       // Deactivate existing assignments
//       await ShiftAssignment.updateMany(
//         {
//           user: user._id,
//           organizationId: req.user.organizationId,
//           status: 'active'
//         },
//         {
//           status: 'expired',
//           endDate: new Date(startDate) - 1
//         }
//       );
      
//       // Create new assignment
//       return ShiftAssignment.create({
//         user: user._id,
//         organizationId: req.user.organizationId,
//         shiftGroupId: group._id,
//         startDate: new Date(startDate),
//         endDate: endDate ? new Date(endDate) : null,
//         assignedBy: req.user._id,
//         status: 'active'
//       });
//     })
//   );
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       group: group.name,
//       assignedUsers: assignments.length,
//       assignments
//     }
//   });
// });

// /**
//  * @desc    Get group assignments
//  * @route   GET /api/v1/shift-groups/:id/assignments
//  * @access  Private
//  */
// exports.getGroupAssignments = catchAsync(async (req, res, next) => {
//   const group = await ShiftGroup.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!group) {
//     return next(new AppError('Shift group not found', 404));
//   }
  
//   const ShiftAssignment = mongoose.model('ShiftAssignment');
  
//   const assignments = await ShiftAssignment.find({
//     organizationId: req.user.organizationId,
//     shiftGroupId: group._id,
//     status: 'active'
//   })
//   .populate('user', 'name employeeProfile.employeeId employeeProfile.departmentId')
//   .populate('shiftId', 'name code startTime endTime')
//   .sort('startDate');
  
//   res.status(200).json({
//     status: 'success',
//     results: assignments.length,
//     data: { assignments }
//   });
// });
