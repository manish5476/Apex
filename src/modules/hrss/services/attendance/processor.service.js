const AttendanceDaily = require('../../models/attendance/attendanceDaily.model');
const User = require('../../../modules/auth/core/user.model');
const LeaveRequest = require('../../models/leave.model');
const Shift = require('../../models/shift.model');
const Holiday = require('../../models/holiday.model');
const dayjs = require('dayjs');

class AttendanceProcessor {
  
  /**
   * Process daily attendance for all users
   * Should be scheduled to run nightly (e.g., 2 AM)
   */
  async processDailyAttendance(dateStr = null) {
    const processDate = dateStr || dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    console.log(`Processing attendance for date: ${processDate}`);
    
    // Get all active organizations
    const organizations = await require('../../../modules/auth/core/organization.model')
      .find({ status: 'active' })
      .select('_id');
    
    for (const org of organizations) {
      await this.processOrganizationAttendance(org._id, processDate);
    }
    
    console.log('Daily attendance processing completed');
  }
  
  /**
   * Process attendance for a specific organization
   */
  async processOrganizationAttendance(organizationId, dateStr) {
    // Get all active users in organization
    const users = await User.find({
      organizationId,
      isActive: true,
      'attendanceConfig.isAttendanceEnabled': true
    });
    
    for (const user of users) {
      await this.processUserAttendance(user, dateStr);
    }
  }
  
  /**
   * Process attendance for a specific user
   */
  async processUserAttendance(user, dateStr) {
    const dayOfWeek = dayjs(dateStr).day();
    
    // Check if day is a holiday
    const holiday = await Holiday.findOne({
      organizationId: user.organizationId,
      $or: [
        { branchId: null }, // Organization-wide
        { branchId: user.branchId } // Branch-specific
      ],
      date: dateStr
    });
    
    // Check user's shift for weekly off
    const shift = user.shiftId ? await Shift.findById(user.shiftId) : null;
    const isWeeklyOff = shift && shift.weeklyOffs && shift.weeklyOffs.includes(dayOfWeek);
    
    // Check existing attendance record
    let daily = await AttendanceDaily.findOne({
      user: user._id,
      date: dateStr
    });
    
    // If record exists, update status based on punches
    if (daily) {
      await this.updateExistingRecord(daily, holiday, isWeeklyOff);
      return;
    }
    
    // No record exists - create one based on day type
    await this.createMissingRecord(user, dateStr, holiday, isWeeklyOff);
  }
  
  /**
   * Update existing attendance record
   */
  async updateExistingRecord(daily, holiday, isWeeklyOff) {
    // Check for incomplete punches (only firstIn, no lastOut)
    if (daily.firstIn && !daily.lastOut) {
      daily.status = 'missed_punch';
      daily.remarks = 'Missed punch-out';
      daily.isEarlyDeparture = true;
    }
    
    // Check if worked on holiday/weekly off
    if (daily.firstIn) {
      if (holiday) {
        daily.status = 'holiday_work';
        daily.payoutMultiplier = 2.0;
        daily.remarks = `Worked on holiday: ${holiday.name}`;
      } else if (isWeeklyOff) {
        daily.status = 'week_off_work';
        daily.payoutMultiplier = 1.5;
        daily.remarks = 'Worked on weekly off';
      }
    }
    
    // Check if on leave
    const leave = await LeaveRequest.findOne({
      user: daily.user,
      status: 'approved',
      startDate: { $lte: daily.date },
      endDate: { $gte: daily.date }
    });
    
    if (leave && !daily.firstIn) {
      daily.status = 'on_leave';
      daily.payoutMultiplier = leave.leaveType === 'unpaid' ? 0 : 1;
      daily.remarks = `Leave: ${leave.leaveType}`;
      daily.leaveRequestId = leave._id;
    }
    
    await daily.save();
  }
  
  /**
   * Create missing attendance record
   */
  async createMissingRecord(user, dateStr, holiday, isWeeklyOff) {
    // Check if user is on leave
    const leave = await LeaveRequest.findOne({
      user: user._id,
      status: 'approved',
      startDate: { $lte: dateStr },
      endDate: { $gte: dateStr }
    });
    
    let status = 'absent';
    let multiplier = 0;
    let remarks = '';
    
    if (leave) {
      status = 'on_leave';
      multiplier = leave.leaveType === 'unpaid' ? 0 : 1;
      remarks = `Leave: ${leave.leaveType}`;
    } else if (holiday) {
      status = 'holiday';
      multiplier = 1;
      remarks = holiday.name;
    } else if (isWeeklyOff) {
      status = 'week_off';
      multiplier = 1;
      remarks = 'Weekly off';
    }
    
    // Create attendance record
    await AttendanceDaily.create({
      user: user._id,
      organizationId: user.organizationId,
      branchId: user.branchId,
      date: dateStr,
      shiftId: user.shiftId,
      status,
      payoutMultiplier: multiplier,
      remarks,
      calendarEvents: holiday ? [holiday.name] : []
    });
  }
  
  /**
   * Recalculate attendance for a date range
   */
  async recalculateAttendance(organizationId, startDate, endDate) {
    const users = await User.find({
      organizationId,
      isActive: true
    }).select('_id');
    
    for (const user of users) {
      const dates = this.getDateRange(startDate, endDate);
      
      for (const dateStr of dates) {
        await this.processUserAttendance(user, dateStr);
      }
    }
  }
  
  /**
   * Generate date range array
   */
  getDateRange(startDate, endDate) {
    const dates = [];
    let current = dayjs(startDate);
    const end = dayjs(endDate);
    
    while (current <= end) {
      dates.push(current.format('YYYY-MM-DD'));
      current = current.add(1, 'day');
    }
    
    return dates;
  }
}

module.exports = new AttendanceProcessor();