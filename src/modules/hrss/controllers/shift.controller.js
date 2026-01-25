const catchAsync = require('../../core/utils/catchAsync');
const AppError = require('../../core/utils/appError');
const Shift = require('../models/shift.model');
const User = require('../../../modules/auth/core/user.model');

class ShiftController {
  
  /**
   * Create shift
   */
  createShift = catchAsync(async (req, res, next) => {
    const {
      name,
      code,
      startTime,
      endTime,
      breaks,
      gracePeriodMins,
      lateThresholdMins,
      halfDayThresholdHrs,
      minFullDayHrs,
      isNightShift,
      weeklyOffs,
      workingDays,
      overtimeRules,
      locationRestrictions,
      description
    } = req.body;
    
    // Check for duplicate name
    const existing = await Shift.findOne({
      organizationId: req.user.organizationId,
      name,
      isActive: true
    });
    
    if (existing) {
      throw new AppError('Shift with this name already exists', 400);
    }
    
    // If this is the first shift, make it default
    const shiftCount = await Shift.countDocuments({
      organizationId: req.user.organizationId,
      isActive: true
    });
    
    const isDefault = shiftCount === 0;
    
    const shift = await Shift.create({
      name,
      code: code || name.toUpperCase().replace(/\s+/g, '_'),
      organizationId: req.user.organizationId,
      startTime,
      endTime,
      breaks: breaks || [],
      gracePeriodMins: gracePeriodMins || 15,
      lateThresholdMins: lateThresholdMins || 30,
      halfDayThresholdHrs: halfDayThresholdHrs || 4,
      minFullDayHrs: minFullDayHrs || 8,
      isNightShift: isNightShift || false,
      weeklyOffs: weeklyOffs || [0], // Sunday by default
      workingDays: workingDays || [1, 2, 3, 4, 5], // Mon-Fri by default
      overtimeRules: overtimeRules || {
        dailyThreshold: 9,
        weeklyThreshold: 48,
        multiplier: 1.5,
        nightMultiplier: 2.0
      },
      locationRestrictions: locationRestrictions || {
        enabled: false,
        radius: 100,
        locations: []
      },
      description,
      isDefault,
      createdBy: req.user._id
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Shift created successfully',
      data: shift
    });
  });
  
  /**
   * Get all shifts
   */
  getAllShifts = catchAsync(async (req, res, next) => {
    const { isActive, includeUsers } = req.query;
    
    const filter = { organizationId: req.user.organizationId };
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    const shifts = await Shift.find(filter)
      .sort({ isDefault: -1, name: 1 })
      .populate('createdBy', 'name email')
      .lean();
    
    // Include user count if requested
    if (includeUsers === 'true') {
      const shiftIds = shifts.map(s => s._id);
      const userCounts = await User.aggregate([
        {
          $match: {
            organizationId: req.user.organizationId,
            shiftId: { $in: shiftIds }
          }
        },
        {
          $group: {
            _id: '$shiftId',
            count: { $sum: 1 }
          }
        }
      ]);
      
      // Map counts to shifts
      const countMap = {};
      userCounts.forEach(item => {
        countMap[item._id.toString()] = item.count;
      });
      
      shifts.forEach(shift => {
        shift.userCount = countMap[shift._id.toString()] || 0;
      });
    }
    
    res.status(200).json({
      status: 'success',
      results: shifts.length,
      data: shifts
    });
  });
  
  /**
   * Get shift by ID
   */
  getShiftById = catchAsync(async (req, res, next) => {
    const shift = await Shift.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!shift) {
      throw new AppError('Shift not found', 404);
    }
    
    // Get users assigned to this shift
    const users = await User.find({
      organizationId: req.user.organizationId,
      shiftId: shift._id
    })
      .select('name email department position employeeId')
      .lean();
    
    res.status(200).json({
      status: 'success',
      data: {
        ...shift.toObject(),
        assignedUsers: users,
        userCount: users.length
      }
    });
  });
  
  /**
   * Update shift
   */
  updateShift = catchAsync(async (req, res, next) => {
    // Prevent changing organizationId and isDefault via update
    if (req.body.organizationId) delete req.body.organizationId;
    if (req.body.isDefault) delete req.body.isDefault;
    
    const shift = await Shift.findOneAndUpdate(
      { 
        _id: req.params.id, 
        organizationId: req.user.organizationId 
      },
      {
        ...req.body,
        updatedBy: req.user._id
      },
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!shift) {
      throw new AppError('Shift not found', 404);
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Shift updated successfully',
      data: shift
    });
  });
  
  /**
   * Delete shift (soft delete)
   */
  deleteShift = catchAsync(async (req, res, next) => {
    const shift = await Shift.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });
    
    if (!shift) {
      throw new AppError('Shift not found', 404);
    }
    
    // Check if shift is assigned to any user
    const userCount = await User.countDocuments({
      organizationId: req.user.organizationId,
      shiftId: shift._id,
      isActive: true
    });
    
    if (userCount > 0) {
      throw new AppError(`Cannot delete shift. It is assigned to ${userCount} users.`, 400);
    }
    
    // Soft delete
    shift.isActive = false;
    shift.updatedBy = req.user._id;
    await shift.save();
    
    // If this was the default shift, assign a new default
    if (shift.isDefault) {
      const newDefault = await Shift.findOne({
        organizationId: req.user.organizationId,
        isActive: true,
        _id: { $ne: shift._id }
      });
      
      if (newDefault) {
        newDefault.isDefault = true;
        await newDefault.save();
      }
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Shift deleted successfully'
    });
  });
  
  /**
   * Set default shift
   */
  setDefaultShift = catchAsync(async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Unset current default
      await Shift.updateMany(
        {
          organizationId: req.user.organizationId,
          isActive: true,
          isDefault: true
        },
        { isDefault: false },
        { session }
      );
      
      // Set new default
      const shift = await Shift.findOneAndUpdate(
        {
          _id: req.params.id,
          organizationId: req.user.organizationId,
          isActive: true
        },
        { isDefault: true },
        { new: true, session }
      );
      
      if (!shift) {
        throw new AppError('Shift not found', 404);
      }
      
      await session.commitTransaction();
      
      res.status(200).json({
        status: 'success',
        message: 'Default shift updated',
        data: shift
      });
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  });
  
  /**
   * Assign shift to users
   */
  assignShiftToUsers = catchAsync(async (req, res, next) => {
    const { userIds, effectiveDate } = req.body;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new AppError('Please provide user IDs', 400);
    }
    
    const shift = await Shift.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
      isActive: true
    });
    
    if (!shift) {
      throw new AppError('Shift not found', 404);
    }
    
    // Update users
    const result = await User.updateMany(
      {
        _id: { $in: userIds },
        organizationId: req.user.organizationId
      },
      {
        shiftId: shift._id,
        shiftAssignedAt: new Date(),
        shiftEffectiveDate: effectiveDate ? new Date(effectiveDate) : new Date()
      }
    );
    
    res.status(200).json({
      status: 'success',
      message: `Shift assigned to ${result.modifiedCount} users`,
      data: {
        shiftId: shift._id,
        shiftName: shift.name,
        assignedCount: result.modifiedCount
      }
    });
  });
  
  /**
   * Get shift rotation schedule
   */
  getShiftRotation = catchAsync(async (req, res, next) => {
    const { startDate, endDate, userId } = req.query;
    
    const filter = { organizationId: req.user.organizationId };
    if (userId) filter._id = userId;
    
    const users = await User.find(filter)
      .select('name email department shiftId')
      .populate('shiftId', 'name startTime endTime')
      .lean();
    
    // Generate rotation schedule
    const schedule = [];
    const currentDate = dayjs(startDate || dayjs().format('YYYY-MM-DD'));
    const endDateObj = dayjs(endDate || currentDate.add(14, 'day'));
    
    users.forEach(user => {
      const userSchedule = {
        userId: user._id,
        userName: user.name,
        department: user.department,
        shift: user.shiftId,
        schedule: []
      };
      
      let date = currentDate;
      while (date <= endDateObj) {
        const dayOfWeek = date.day();
        const isWorkingDay = user.shiftId ? 
          user.shiftId.workingDays.includes(dayOfWeek) : 
          [1, 2, 3, 4, 5].includes(dayOfWeek);
        
        userSchedule.schedule.push({
          date: date.format('YYYY-MM-DD'),
          day: date.format('dddd'),
          isWorkingDay,
          shift: isWorkingDay ? user.shiftId : null
        });
        
        date = date.add(1, 'day');
      }
      
      schedule.push(userSchedule);
    });
    
    res.status(200).json({
      status: 'success',
      data: {
        startDate: currentDate.format('YYYY-MM-DD'),
        endDate: endDateObj.format('YYYY-MM-DD'),
        schedule
      }
    });
  });
  
  /**
   * Check shift compliance
   */
  checkShiftCompliance = catchAsync(async (req, res, next) => {
    const { date } = req.query;
    const targetDate = date || dayjs().format('YYYY-MM-DD');
    
    // Get all users with their shifts
    const users = await User.find({
      organizationId: req.user.organizationId,
      isActive: true,
      shiftId: { $ne: null }
    })
      .select('name email department shiftId')
      .populate('shiftId')
      .lean();
    
    // Get attendance for the date
    const attendance = await AttendanceDaily.find({
      organizationId: req.user.organizationId,
      date: targetDate,
      user: { $in: users.map(u => u._id) }
    })
      .select('user firstIn lastOut isLate status')
      .lean();
    
    const attendanceMap = {};
    attendance.forEach(record => {
      attendanceMap[record.user.toString()] = record;
    });
    
    // Check compliance
    const complianceReport = [];
    let compliant = 0;
    let nonCompliant = 0;
    
    users.forEach(user => {
      const record = attendanceMap[user._id.toString()];
      const issues = [];
      
      if (!record) {
        issues.push('No attendance recorded');
      } else if (record.status === 'present' && user.shiftId) {
        // Check late arrival
        if (record.isLate) {
          issues.push('Late arrival');
        }
        
        // Check early departure
        if (record.lastOut) {
          const [endHour, endMinute] = user.shiftId.endTime.split(':').map(Number);
          const shiftEnd = dayjs(record.lastOut)
            .set('hour', endHour)
            .set('minute', endMinute);
          
          const graceEnd = shiftEnd.add(user.shiftId.earlyDepartureThresholdMins || 30, 'minute');
          
          if (dayjs(record.lastOut).isBefore(graceEnd)) {
            issues.push('Early departure');
          }
        }
      }
      
      const isCompliant = issues.length === 0;
      if (isCompliant) compliant++;
      else nonCompliant++;
      
      complianceReport.push({
        userId: user._id,
        userName: user.name,
        department: user.department,
        shift: user.shiftId.name,
        attendanceStatus: record ? record.status : 'absent',
        isCompliant,
        issues
      });
    });
    
    res.status(200).json({
      status: 'success',
      data: {
        date: targetDate,
        summary: {
          totalUsers: users.length,
          compliant,
          nonCompliant,
          complianceRate: (compliant / users.length) * 100
        },
        report: complianceReport
      }
    });
  });
}

module.exports = new ShiftController();