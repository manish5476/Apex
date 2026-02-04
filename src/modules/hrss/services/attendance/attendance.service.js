const AttendanceDaily = require('../../models/attendance/attendanceDaily.model');
const AttendanceLog = require('../../models/attendance/attendanceLog.model');
const AttendanceRequest = require('../../models/attendance/attendanceRequest.model');
const User = require('../../../modules/auth/core/user.model');
const Shift = require('../../models/shift.model');
const Holiday = require('../../models/holiday.model');
const AppError = require('../../../core/utils/appError');
const dayjs = require('dayjs');
const mongoose = require('mongoose');

class AttendanceService {
  
  /**
   * Get user attendance history (Updated for your User model)
   */
  async getUserAttendance(userId, filters = {}) {
    const {
      month,
      startDate,
      endDate,
      page = 1,
      limit = 30,
      populate = true
    } = filters;
    
    const query = { user: userId };
    
    // Date filtering
    if (month) {
      query.date = { $regex: `^${month}` };
    } else if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    const skip = (page - 1) * limit;
    
    const [records, total] = await Promise.all([
      AttendanceDaily.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .populate(populate ? [
          { 
            path: 'logs', 
            select: 'type timestamp location source',
            options: { sort: { timestamp: 1 } }
          },
          { 
            path: 'shiftId', 
            select: 'name startTime endTime' 
          },
          { 
            path: 'verifiedBy', 
            select: 'name email' 
          }
        ] : [])
        .lean(),
      AttendanceDaily.countDocuments(query)
    ]);
    
    // Calculate summary using aggregation for better performance
    const summary = await AttendanceDaily.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          present: { 
            $sum: { 
              $cond: [
                { $in: ['$status', ['present', 'half_day', 'work_from_home', 'on_duty']] }, 
                1, 
                0 
              ] 
            } 
          },
          absent: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] 
            } 
          },
          late: { $sum: { $cond: ['$isLate', 1, 0] } },
          halfDay: { $sum: { $cond: ['$isHalfDay', 1, 0] } },
          totalHours: { $sum: '$totalWorkHours' },
          overtimeHours: { $sum: '$overtimeHours' },
          netHours: { $sum: '$netWorkHours' }
        }
      }
    ]);
    
    return {
      records,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      summary: summary[0] || {
        present: 0,
        absent: 0,
        late: 0,
        halfDay: 0,
        totalHours: 0,
        overtimeHours: 0,
        netHours: 0
      }
    };
  }
  
  /**
   * Mark attendance via web/mobile (Updated for your User model)
   */
  async markAttendance(userId, data, req) {
    const {
      type,
      latitude,
      longitude,
      accuracy,
      notes,
      deviceId
    } = data;
    
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    
    // Check if user is active
    if (!user.isActive || user.status !== 'approved') {
      throw new AppError('Your account is not active', 403);
    }
    
    // Check permissions based on your attendanceConfig
    if (type === 'in' || type === 'out') {
      if (!user.attendanceConfig?.allowWebPunch && !user.attendanceConfig?.allowMobilePunch) {
        throw new AppError('Web/Mobile attendance is not enabled for your account', 403);
      }
    }
    
    // Validate geo-fencing if enabled
    if (user.attendanceConfig?.enforceGeoFence) {
      const geoValidation = await this.validateGeoFence(user, latitude, longitude);
      if (!geoValidation.isValid) {
        throw new AppError(geoValidation.reason, 400);
      }
    }
    
    // Check punch restrictions
    await this.validatePunchRestrictions(user, type);
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const now = new Date();
      const dateStr = dayjs(now).format('YYYY-MM-DD');
      const timeStr = dayjs(now).format('HH:mm:ss');
      
      // Create log entry
      const log = new AttendanceLog({
        source: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'web',
        user: user._id,
        organizationId: user.organizationId,
        branchId: user.branchId,
        timestamp: now,
        type,
        location: {
          type: 'Point',
          coordinates: [longitude, latitude],
          accuracy,
          geofenceStatus: 'inside'
        },
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        deviceId,
        processingStatus: 'processed',
        processingNotes: notes
      });
      
      await log.save({ session });
      
      // Update or create daily record with night shift logic
      await this.updateDailyAttendance(user, now, log, session);
      
      await session.commitTransaction();
      
      // Update user's attendance summary
      await this.updateUserAttendanceSummary(user._id);
      
      return {
        success: true,
        data: {
          type,
          time: timeStr,
          date: dateStr,
          logId: log._id,
          message: `${type.toUpperCase()} punch recorded successfully`
        }
      };
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Update daily attendance record (with night shift support)
   */
  async updateDailyAttendance(user, punchTime, log, session) {
    let dateStr = dayjs(punchTime).format('YYYY-MM-DD');
    
    // Night shift logic
    if (user.attendanceConfig?.shiftId) {
      const shift = await Shift.findById(user.attendanceConfig.shiftId).session(session);
      
      if (shift && shift.isNightShift) {
        dateStr = this.adjustDateForNightShift(punchTime, shift);
      }
    }
    
    let daily = await AttendanceDaily.findOne({
      user: user._id,
      date: dateStr
    }).session(session);
    
    if (!daily) {
      daily = new AttendanceDaily({
        user: user._id,
        organizationId: user.organizationId,
        branchId: user.branchId,
        date: dateStr,
        logs: [log._id],
        status: 'present',
        shiftId: user.attendanceConfig?.shiftId || null
      });
      
      // Set shift timings if shift exists
      if (user.attendanceConfig?.shiftId) {
        const shift = await Shift.findById(user.attendanceConfig.shiftId).session(session);
        if (shift) {
          daily.shiftId = shift._id;
          daily.scheduledInTime = shift.startTime;
          daily.scheduledOutTime = shift.endTime;
        }
      }
      
      if (log.type === 'in') {
        daily.firstIn = punchTime;
      }
    } else {
      daily.logs.push(log._id);
      
      // Update first in if earlier
      if (log.type === 'in' && (!daily.firstIn || punchTime < daily.firstIn)) {
        daily.firstIn = punchTime;
      }
      
      // Update last out if later
      if (log.type === 'out' && (!daily.lastOut || punchTime > daily.lastOut)) {
        daily.lastOut = punchTime;
      }
    }
    
    // Calculate hours if both in and out exist
    if (daily.firstIn && daily.lastOut) {
      const diffMs = daily.lastOut - daily.firstIn;
      daily.totalWorkHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
      
      // Check for overtime
      await this.calculateOvertime(daily, session);
      
      // Check for half day
      await this.checkHalfDay(daily, session);
      
      // Check for late arrival
      await this.checkLateArrival(daily, session);
    }
    
    await daily.save({ session });
  }
  
  /**
   * Adjust date for night shift
   */
  adjustDateForNightShift(punchTime, shift) {
    const punchHour = punchTime.getHours();
    const [endHour] = shift.endTime.split(':').map(Number);
    const cutoffHour = endHour + 4; // 4 hours buffer after shift end
    
    if (punchHour <= cutoffHour) {
      return dayjs(punchTime).subtract(1, 'day').format('YYYY-MM-DD');
    }
    
    return dayjs(punchTime).format('YYYY-MM-DD');
  }
  
  /**
   * Calculate overtime hours
   */
  async calculateOvertime(daily, session) {
    if (!daily.shiftId) return;
    
    const shift = await Shift.findById(daily.shiftId).session(session);
    if (!shift) return;
    
    const shiftHours = shift.minFullDayHrs || 8;
    
    if (daily.totalWorkHours > shiftHours) {
      daily.overtimeHours = daily.totalWorkHours - shiftHours;
      daily.isOvertime = true;
      
      // Apply overtime multiplier
      if (shift.isNightShift) {
        daily.overtimeMultiplier = shift.overtimeRules?.nightMultiplier || 2.0;
      } else {
        daily.overtimeMultiplier = shift.overtimeRules?.multiplier || 1.5;
      }
    }
  }
  
  /**
   * Check half day
   */
  async checkHalfDay(daily, session) {
    if (!daily.shiftId) return;
    
    const shift = await Shift.findById(daily.shiftId).session(session);
    if (!shift) return;
    
    const halfDayThreshold = shift.halfDayThresholdHrs || 4;
    
    if (daily.totalWorkHours < halfDayThreshold) {
      daily.isHalfDay = true;
      daily.status = 'half_day';
    }
  }
  
  /**
   * Check late arrival
   */
  async checkLateArrival(daily, session) {
    if (!daily.firstIn || !daily.shiftId) return;
    
    const shift = await Shift.findById(daily.shiftId).session(session);
    if (!shift || !daily.scheduledInTime) return;
    
    const [scheduledHour, scheduledMinute] = daily.scheduledInTime.split(':').map(Number);
    const scheduledTime = new Date(daily.firstIn);
    scheduledTime.setHours(scheduledHour, scheduledMinute, 0, 0);
    
    const graceMs = (shift.gracePeriodMins || 15) * 60 * 1000;
    
    if (daily.firstIn > new Date(scheduledTime.getTime() + graceMs)) {
      daily.isLate = true;
      
      // Calculate late minutes
      const lateMs = daily.firstIn - (scheduledTime.getTime() + graceMs);
      daily.lateMinutes = Math.floor(lateMs / (1000 * 60));
    }
  }
  
  /**
   * Validate punch restrictions
   */
  async validatePunchRestrictions(user, type) {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Check time restrictions
    if (user.attendanceConfig?.punchRestrictions) {
      const { allowedStart = 6, allowedEnd = 22 } = user.attendanceConfig.punchRestrictions;
      
      if (currentHour < allowedStart || currentHour > allowedEnd) {
        throw new AppError(
          `Punching allowed only between ${allowedStart}:00 and ${allowedEnd}:00`, 
          400
        );
      }
    }
    
    // Check for duplicate recent punch
    const recentPunch = await AttendanceLog.findOne({
      user: user._id,
      type,
      timestamp: { $gte: dayjs().subtract(2, 'minutes').toDate() }
    });
    
    if (recentPunch) {
      throw new AppError('Duplicate punch detected. Please wait before punching again.', 429);
    }
  }
  
  /**
   * Validate geo-fencing
   */
  async validateGeoFence(user, lat, lng) {
    if (!user.attendanceConfig?.enforceGeoFence) {
      return { isValid: true, distance: 0, reason: '' };
    }
    
    if (lat == null || lng == null) {
      return { 
        isValid: false, 
        distance: 0, 
        reason: 'Location access is required for attendance marking' 
      };
    }
    
    // Get branch location
    const Branch = require('../../../modules/organization/core/branch.model');
    const branch = await Branch.findById(user.branchId);
    
    if (!branch?.location || branch.location.lat == null || branch.location.lng == null) {
      return { 
        isValid: false, 
        distance: 0, 
        reason: 'Your branch location is not configured. Contact Admin.' 
      };
    }
    
    // Calculate distance
    const distance = this.calculateDistance(
      lat,
      lng,
      branch.location.lat,
      branch.location.lng
    );
    
    const maxRadius = user.attendanceConfig.geoFenceRadius || 100;
    
    if (distance > maxRadius) {
      return { 
        isValid: false, 
        distance,
        reason: `You are ${Math.round(distance)}m away from office. Must be within ${maxRadius}m.` 
      };
    }
    
    return { isValid: true, distance, reason: '' };
  }
  
  /**
   * Calculate distance between two coordinates
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c; // Distance in meters
  }
  
  /**
   * Update user's attendance summary
   */
  async updateUserAttendanceSummary(userId) {
    const today = dayjs().format('YYYY-MM-DD');
    const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
    
    const monthStats = await AttendanceDaily.aggregate([
      {
        $match: {
          user: mongoose.Types.ObjectId.createFromHexString(userId),
          date: { $gte: startOfMonth, $lte: today }
        }
      },
      {
        $group: {
          _id: null,
          present: { 
            $sum: { 
              $cond: [
                { $in: ['$status', ['present', 'half_day', 'work_from_home', 'on_duty']] }, 
                1, 
                0 
              ] 
            } 
          },
          absent: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] 
            } 
          },
          late: { $sum: { $cond: ['$isLate', 1, 0] } },
          halfDay: { $sum: { $cond: ['$isHalfDay', 1, 0] } },
          totalHours: { $sum: '$totalWorkHours' },
          overtimeHours: { $sum: '$overtimeHours' }
        }
      }
    ]);
    
    if (monthStats.length > 0) {
      const stats = monthStats[0];
      const workingDays = dayjs().date(); // Days passed in current month
      const attendanceRate = workingDays > 0 ? (stats.present / workingDays) * 100 : 0;
      
      await User.findByIdAndUpdate(userId, {
        'attendanceSummary.totalPresent': stats.present,
        'attendanceSummary.totalAbsent': stats.absent,
        'attendanceSummary.totalLate': stats.late,
        'attendanceSummary.totalHalfDay': stats.halfDay,
        'attendanceSummary.totalOvertimeHours': stats.overtimeHours || 0,
        'attendanceSummary.attendanceRate': attendanceRate,
        'attendanceSummary.lastUpdated': new Date()
      });
    }
  }
  
  /**
   * Get team attendance for managers
   */
  async getTeamAttendance(managerId, filters = {}) {
    const {
      date = dayjs().format('YYYY-MM-DD'),
      department,
      includeSubordinates = true
    } = filters;
    
    // Get manager's team members
    let teamMembers = await User.find({ 
      reportingManager: managerId,
      isActive: true,
      status: 'approved'
    }).select('_id name email department position employeeId avatar');
    
    // Include subordinates if requested
    if (includeSubordinates) {
      const allSubordinates = await this.getAllSubordinates(managerId);
      const subordinateIds = allSubordinates.map(u => u._id);
      
      const directReportIds = teamMembers.map(u => u._id);
      const uniqueIds = [...new Set([...directReportIds, ...subordinateIds])];
      
      teamMembers = await User.find({
        _id: { $in: uniqueIds },
        isActive: true,
        status: 'approved'
      }).select('_id name email department position employeeId avatar');
    }
    
    // Filter by department if specified
    if (department) {
      teamMembers = teamMembers.filter(member => member.department === department);
    }
    
    const memberIds = teamMembers.map(m => m._id);
    
    // Get attendance for the date
    const attendance = await AttendanceDaily.find({
      user: { $in: memberIds },
      date
    })
      .populate('user', 'name email department position employeeId avatar')
      .populate('shiftId', 'name startTime endTime')
      .populate({
        path: 'logs',
        match: { type: { $in: ['in', 'out'] } },
        options: { sort: { timestamp: 1 }, limit: 2 }
      })
      .lean();
    
    // Create map for quick lookup
    const attendanceMap = new Map();
    attendance.forEach(record => {
      attendanceMap.set(String(record.user._id), record);
    });
    
    // Combine team members with attendance records
    const completeData = teamMembers.map(member => {
      const record = attendanceMap.get(String(member._id));
      
      if (record) {
        return record;
      } else {
        // Check if user is on leave
        const isOnLeave = this.checkIfOnLeave(member._id, date);
        
        return {
          user: member,
          date,
          status: isOnLeave ? 'on_leave' : 'absent',
          totalWorkHours: 0,
          isLate: false,
          isHalfDay: false,
          logs: []
        };
      }
    });
    
    // Calculate team summary
    const teamSummary = {
      totalMembers: teamMembers.length,
      present: completeData.filter(d => d.status === 'present').length,
      absent: completeData.filter(d => d.status === 'absent').length,
      late: completeData.filter(d => d.isLate).length,
      onLeave: completeData.filter(d => d.status === 'on_leave').length,
      halfDay: completeData.filter(d => d.isHalfDay).length,
      checkedIn: completeData.filter(d => d.firstIn).length
    };
    
    return {
      date,
      teamSummary,
      data: completeData
    };
  }
  
  /**
   * Get all subordinates recursively
   */
  async getAllSubordinates(managerId) {
    const directReports = await User.find({ 
      reportingManager: managerId,
      isActive: true 
    }).select('_id');
    
    let allReports = [...directReports];
    
    for (const report of directReports) {
      const subReports = await this.getAllSubordinates(report._id);
      allReports = [...allReports, ...subReports];
    }
    
    return allReports;
  }
  
  /**
   * Check if user is on leave
   */
  async checkIfOnLeave(userId, date) {
    const LeaveRequest = require('../../models/leave.model');
    
    const leave = await LeaveRequest.findOne({
      user: userId,
      status: 'approved',
      startDate: { $lte: date },
      endDate: { $gte: date }
    });
    
    return !!leave;
  }
  
  /**
   * Submit regularization request
   */
  async submitRegularization(userId, data) {
    const {
      targetDate,
      type,
      newFirstIn,
      newLastOut,
      reason,
      supportingDocs,
      urgency = 'medium'
    } = data;
    
    // Validate date
    if (!dayjs(targetDate, 'YYYY-MM-DD', true).isValid()) {
      throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
    }
    
    if (dayjs(targetDate).isAfter(dayjs(), 'day')) {
      throw new AppError('Cannot regularize future dates', 400);
    }
    
    // Check for existing pending request
    const existing = await AttendanceRequest.findOne({
      user: userId,
      targetDate,
      status: { $in: ['draft', 'pending', 'under_review'] }
    });
    
    if (existing) {
      throw new AppError('A pending request already exists for this date', 409);
    }
    
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    
    // Get approval chain based on user's reporting structure
    const approvalChain = await this.getApprovalChain(user);
    
    // Create request
    const request = await AttendanceRequest.create({
      user: userId,
      organizationId: user.organizationId,
      branchId: user.branchId,
      targetDate,
      type,
      correction: {
        newFirstIn: newFirstIn ? new Date(newFirstIn) : undefined,
        newLastOut: newLastOut ? new Date(newLastOut) : undefined,
        reason,
        supportingDocs
      },
      urgency,
      approvers: approvalChain,
      approvalRequired: approvalChain.length,
      history: [{
        action: 'created',
        by: userId,
        remarks: 'Request submitted'
      }]
    });
    
    return request;
  }
  
  /**
   * Get approval chain based on reporting structure
   */
  async getApprovalChain(user) {
    const chain = [];
    
    // Immediate manager
    if (user.reportingManager) {
      chain.push({
        user: user.reportingManager,
        role: 'manager',
        status: 'pending',
        order: 1,
        isMandatory: true
      });
    }
    
    // HR manager if exists
    if (user.hrManager) {
      chain.push({
        user: user.hrManager,
        role: 'hr',
        status: 'pending',
        order: 2,
        isMandatory: true
      });
    }
    
    // If no specific HR, find HR in organization
    if (!user.hrManager) {
      const hrUser = await User.findOne({
        organizationId: user.organizationId,
        role: 'hr', // Assuming you have HR role
        isActive: true
      });
      
      if (hrUser) {
        chain.push({
          user: hrUser._id,
          role: 'hr',
          status: 'pending',
          order: 2,
          isMandatory: false
        });
      }
    }
    
    return chain;
  }
}

module.exports = new AttendanceService();

// const AttendanceDaily = require('../../models/attendance/attendanceDaily.model');
// const AttendanceLog = require('../../models/attendance/attendanceLog.model');
// const AttendanceRequest = require('../../models/attendance/attendanceRequest.model');
// const User = require('../../../modules/auth/core/user.model');
// const Shift = require('../../models/shift.model');
// const Holiday = require('../../models/holiday.model');
// const AppError = require('../../../core/utils/appError');
// const dayjs = require('dayjs');
// const mongoose = require('mongoose');

// class AttendanceService {
//   /**
//    * Get user attendance history
//    */
//   async getUserAttendance(userId, filters = {}) {
//     const {
//       month,
//       startDate,
//       endDate,
//       page = 1,
//       limit = 30,
//       populate = true
//     } = filters;
    
//     const query = { user: userId };
    
//     // Date filtering
//     if (month) {
//       query.date = { $regex: `^${month}` };
//     } else if (startDate && endDate) {
//       query.date = { $gte: startDate, $lte: endDate };
//     }
    
//     const skip = (page - 1) * limit;
    
//     const [records, total] = await Promise.all([
//       AttendanceDaily.find(query)
//         .sort({ date: -1 })
//         .skip(skip)
//         .limit(limit)
//         .populate(populate ? [
//           { path: 'logs', select: 'type timestamp location source' },
//           { path: 'shiftId', select: 'name startTime endTime' }
//         ] : [])
//         .lean(),
//       AttendanceDaily.countDocuments(query)
//     ]);
    
//     // Calculate summary
//     const summary = await AttendanceDaily.aggregate([
//       { $match: query },
//       {
//         $group: {
//           _id: null,
//           present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
//           absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
//           late: { $sum: { $cond: ['$isLate', 1, 0] } },
//           halfDay: { $sum: { $cond: ['$isHalfDay', 1, 0] } },
//           totalHours: { $sum: '$totalWorkHours' },
//           overtimeHours: { $sum: '$overtimeHours' }
//         }
//       }
//     ]);
    
//     return {
//       records,
//       pagination: {
//         total,
//         page,
//         limit,
//         pages: Math.ceil(total / limit)
//       },
//       summary: summary[0] || {
//         present: 0,
//         absent: 0,
//         late: 0,
//         halfDay: 0,
//         totalHours: 0,
//         overtimeHours: 0
//       }
//     };
//   }
  
//   /**
//    * Mark attendance via web/mobile
//    */
//   async markAttendance(userId, data) {
//     const {
//       type,
//       latitude,
//       longitude,
//       accuracy,
//       notes,
//       deviceId
//     } = data;
    
//     const user = await User.findById(userId);
//     if (!user) {
//       throw new AppError('User not found', 404);
//     }
    
//     // Check permissions
//     if (!user.attendanceConfig?.allowWebPunch) {
//       throw new AppError('Web attendance not enabled', 403);
//     }
    
//     // Validate geo-fencing if enabled
//     if (user.attendanceConfig.enforceGeoFence) {
//       const geoValidation = await this.validateGeoFence(user, latitude, longitude);
//       if (!geoValidation.isValid) {
//         throw new AppError(geoValidation.reason, 400);
//       }
//     }
    
//     const session = await mongoose.startSession();
//     session.startTransaction();
    
//     try {
//       const now = new Date();
//       const dateStr = dayjs(now).format('YYYY-MM-DD');
//       const timeStr = dayjs(now).format('HH:mm:ss');
      
//       // Create log entry
//       const log = new AttendanceLog({
//         source: 'web',
//         user: user._id,
//         organizationId: user.organizationId,
//         branchId: user.branchId,
//         timestamp: now,
//         type,
//         location: {
//           type: 'Point',
//           coordinates: [longitude, latitude],
//           accuracy,
//           geofenceStatus: 'inside'
//         },
//         ipAddress: '127.0.0.1', // Should come from request
//         userAgent: 'Web App',
//         deviceId,
//         processingStatus: 'processed',
//         processingNotes: notes
//       });
      
//       await log.save({ session });
      
//       // Update or create daily record
//       let daily = await AttendanceDaily.findOne({
//         user: user._id,
//         date: dateStr
//       }).session(session);
      
//       if (!daily) {
//         daily = new AttendanceDaily({
//           user: user._id,
//           organizationId: user.organizationId,
//           branchId: user.branchId,
//           date: dateStr,
//           logs: [log._id],
//           status: type === 'in' ? 'present' : 'absent'
//         });
        
//         // Get user's shift
//         if (user.shiftId) {
//           const shift = await Shift.findById(user.shiftId).session(session);
//           if (shift) {
//             daily.shiftId = shift._id;
//             daily.scheduledInTime = shift.startTime;
//             daily.scheduledOutTime = shift.endTime;
//           }
//         }
        
//         if (type === 'in') {
//           daily.firstIn = now;
//         }
//       } else {
//         daily.logs.push(log._id);
        
//         if (type === 'in' && (!daily.firstIn || now < daily.firstIn)) {
//           daily.firstIn = now;
//         }
        
//         if (type === 'out' && (!daily.lastOut || now > daily.lastOut)) {
//           daily.lastOut = now;
//         }
//       }
      
//       // Calculate work hours
//       if (daily.firstIn && daily.lastOut) {
//         const diffMs = daily.lastOut - daily.firstIn;
//         daily.totalWorkHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
//       }
      
//       await daily.save({ session });
//       await session.commitTransaction();
      
//       return {
//         success: true,
//         data: {
//           type,
//           time: timeStr,
//           date: dateStr,
//           logId: log._id,
//           dailyId: daily._id
//         }
//       };
      
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }
  
//   /**
//    * Submit regularization request
//    */
//   async submitRegularization(userId, data) {
//     const {
//       targetDate,
//       type,
//       newFirstIn,
//       newLastOut,
//       reason,
//       supportingDocs,
//       urgency = 'medium'
//     } = data;
    
//     // Validate date
//     if (!dayjs(targetDate, 'YYYY-MM-DD', true).isValid()) {
//       throw new AppError('Invalid date format', 400);
//     }
    
//     if (dayjs(targetDate).isAfter(dayjs(), 'day')) {
//       throw new AppError('Cannot regularize future dates', 400);
//     }
    
//     // Check for existing pending request
//     const existing = await AttendanceRequest.findOne({
//       user: userId,
//       targetDate,
//       status: { $in: ['draft', 'pending', 'under_review'] }
//     });
    
//     if (existing) {
//       throw new AppError('Pending request already exists', 409);
//     }
    
//     const user = await User.findById(userId);
//     if (!user) {
//       throw new AppError('User not found', 404);
//     }
    
//     // Create request
//     const request = await AttendanceRequest.create({
//       user: userId,
//       organizationId: user.organizationId,
//       branchId: user.branchId,
//       targetDate,
//       type,
//       correction: {
//         newFirstIn: newFirstIn ? new Date(newFirstIn) : undefined,
//         newLastOut: newLastOut ? new Date(newLastOut) : undefined,
//         reason,
//         supportingDocs
//       },
//       urgency,
//       approvalRequired: user.manager ? 1 : 0,
//       approvers: user.manager ? [{
//         user: user.manager._id,
//         status: 'pending'
//       }] : []
//     });
    
//     return request;
//   }
  
//   /**
//    * Process regularization request (approve/reject)
//    */
//   async processRegularization(requestId, approverId, decision) {
//     const { status, comments, rejectionReason } = decision;
    
//     if (!['approved', 'rejected'].includes(status)) {
//       throw new AppError('Invalid status', 400);
//     }
    
//     const session = await mongoose.startSession();
//     session.startTransaction();
    
//     try {
//       const request = await AttendanceRequest.findById(requestId).session(session);
//       if (!request) {
//         throw new AppError('Request not found', 404);
//       }
      
//       if (!['pending', 'under_review'].includes(request.status)) {
//         throw new AppError('Request already processed', 400);
//       }
      
//       // Update approver status
//       const approverIndex = request.approvers.findIndex(
//         a => String(a.user) === String(approverId)
//       );
      
//       if (approverIndex !== -1) {
//         request.approvers[approverIndex].status = status === 'approved' ? 'approved' : 'rejected';
//         request.approvers[approverIndex].comments = comments;
//         request.approvers[approverIndex].actedAt = new Date();
//       }
      
//       // Check if all approvals done
//       const pendingApprovers = request.approvers.filter(a => a.status === 'pending');
//       const rejectedApprover = request.approvers.find(a => a.status === 'rejected');
      
//       if (rejectedApprover) {
//         request.status = 'rejected';
//         request.rejectionReason = rejectionReason || comments;
//       } else if (pendingApprovers.length === 0) {
//         request.status = 'approved';
//         request.approvedBy = approverId;
//         request.approvedAt = new Date();
        
//         // Apply corrections to attendance record
//         await this.applyAttendanceCorrection(request);
//       } else {
//         request.status = 'under_review';
//         request.currentApproverLevel = request.currentApproverLevel + 1;
//       }
      
//       await request.save({ session });
//       await session.commitTransaction();
      
//       return request;
      
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }
  
//   /**
//    * Apply attendance correction
//    */
//   async applyAttendanceCorrection(request) {
//     let daily = await AttendanceDaily.findOne({
//       user: request.user,
//       date: request.targetDate
//     });
    
//     if (!daily) {
//       daily = new AttendanceDaily({
//         user: request.user,
//         organizationId: request.organizationId,
//         branchId: request.branchId,
//         date: request.targetDate,
//         status: 'present',
//         verifiedBy: request.approvedBy,
//         verifiedAt: new Date()
//       });
//     }
    
//     // Apply corrections
//     if (request.correction.newFirstIn) {
//       daily.firstIn = request.correction.newFirstIn;
      
//       // Create correction log
//       const correctionLog = new AttendanceLog({
//         source: 'admin_manual',
//         user: request.user,
//         organizationId: request.organizationId,
//         branchId: request.branchId,
//         timestamp: request.correction.newFirstIn,
//         type: 'in',
//         isVerified: true,
//         verificationMethod: 'manager',
//         verifiedBy: request.approvedBy,
//         processingStatus: 'corrected',
//         processingNotes: `Corrected via request ${request._id}`
//       });
//       await correctionLog.save();
//       daily.logs.push(correctionLog._id);
//     }
    
//     if (request.correction.newLastOut) {
//       daily.lastOut = request.correction.newLastOut;
      
//       const correctionLog = new AttendanceLog({
//         source: 'admin_manual',
//         user: request.user,
//         organizationId: request.organizationId,
//         branchId: request.branchId,
//         timestamp: request.correction.newLastOut,
//         type: 'out',
//         isVerified: true,
//         verificationMethod: 'manager',
//         verifiedBy: request.approvedBy,
//         processingStatus: 'corrected',
//         processingNotes: `Corrected via request ${request._id}`
//       });
//       await correctionLog.save();
//       daily.logs.push(correctionLog._id);
//     }
    
//     // Recalculate hours
//     if (daily.firstIn && daily.lastOut) {
//       const diffMs = new Date(daily.lastOut) - new Date(daily.firstIn);
//       daily.totalWorkHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
//     }
    
//     await daily.save();
//   }
  
//   /**
//    * Validate geo-fencing
//    */
//   async validateGeoFence(user, lat, lng) {
//     // Implement geo-fencing logic here
//     // This should check against branch location and radius
    
//     return {
//       isValid: true,
//       distance: 0,
//       reason: ''
//     };
//   }
  
//   /**
//    * Get attendance summary for dashboard
//    */
//   async getAttendanceSummary(organizationId, filters = {}) {
//     const {
//       startDate,
//       endDate,
//       branchId,
//       department
//     } = filters;
    
//     const query = {
//       organizationId,
//       date: {
//         $gte: startDate || dayjs().startOf('month').format('YYYY-MM-DD'),
//         $lte: endDate || dayjs().format('YYYY-MM-DD')
//       }
//     };
    
//     if (branchId) {
//       query.branchId = branchId;
//     }
    
//     // Department filter
//     if (department) {
//       const users = await User.find({
//         department,
//         organizationId
//       }).select('_id');
//       query.user = { $in: users.map(u => u._id) };
//     }
    
//     const summary = await AttendanceDaily.aggregate([
//       { $match: query },
//       {
//         $group: {
//           _id: null,
//           totalEmployees: { $addToSet: '$user' },
//           totalDays: { $sum: 1 },
//           presentDays: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
//           absentDays: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
//           lateDays: { $sum: { $cond: ['$isLate', 1, 0] } },
//           halfDays: { $sum: { $cond: ['$isHalfDay', 1, 0] } },
//           totalHours: { $sum: '$totalWorkHours' },
//           overtimeHours: { $sum: '$overtimeHours' },
//           avgHoursPerDay: { $avg: '$totalWorkHours' }
//         }
//       },
//       {
//         $project: {
//           totalEmployees: { $size: '$totalEmployees' },
//           totalDays: 1,
//           presentDays: 1,
//           absentDays: 1,
//           lateDays: 1,
//           halfDays: 1,
//           attendanceRate: { $multiply: [{ $divide: ['$presentDays', '$totalDays'] }, 100] },
//           totalHours: 1,
//           overtimeHours: 1,
//           avgHoursPerDay: 1
//         }
//       }
//     ]);
    
//     return summary[0] || {
//       totalEmployees: 0,
//       totalDays: 0,
//       presentDays: 0,
//       absentDays: 0,
//       lateDays: 0,
//       halfDays: 0,
//       attendanceRate: 0,
//       totalHours: 0,
//       overtimeHours: 0,
//       avgHoursPerDay: 0
//     };
//   }
// }

// module.exports = new AttendanceService();