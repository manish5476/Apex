const catchAsync = require('../../../core/utils/catchAsync');
const attendanceService = require('../../services/attendance/attendance.service');

class AttendanceController {
  
  // Get my attendance
  getMyAttendance = catchAsync(async (req, res, next) => {
    const result = await attendanceService.getUserAttendance(req.user._id, req.query);
    
    res.status(200).json({
      status: 'success',
      ...result
    });
  });
  
  // Mark attendance (web/mobile)
  markAttendance = catchAsync(async (req, res, next) => {
    const result = await attendanceService.markAttendance(req.user._id, req.body);
    
    res.status(200).json({
      status: 'success',
      data: result.data
    });
  });
  
  // Submit regularization request
  submitRegularization = catchAsync(async (req, res, next) => {
    const request = await attendanceService.submitRegularization(req.user._id, req.body);
    
    res.status(201).json({
      status: 'success',
      data: request
    });
  });
  
  // Get my requests
  getMyRequests = catchAsync(async (req, res, next) => {
    const { status, startDate, endDate, page = 1, limit = 20 } = req.query;
    
    const query = { user: req.user._id };
    if (status) query.status = status;
    if (startDate && endDate) {
      query.targetDate = { $gte: startDate, $lte: endDate };
    }
    
    const skip = (page - 1) * limit;
    
    const [requests, total] = await Promise.all([
      require('../../models/attendance/attendanceRequest.model')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('approvedBy', 'name email')
        .lean(),
      require('../../models/attendance/attendanceRequest.model').countDocuments(query)
    ]);
    
    res.status(200).json({
      status: 'success',
      results: requests.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: requests
    });
  });
  
  // Get team attendance
  getTeamAttendance = catchAsync(async (req, res, next) => {
    const { date, department, branchId } = req.query;
    const today = date || dayjs().format('YYYY-MM-DD');
    
    // Get team members (simplified - implement based on your org structure)
    const User = require('../../../modules/auth/core/user.model');
    const teamMembers = await User.find({
      organizationId: req.user.organizationId,
      ...(department && { department }),
      ...(branchId && { branchId })
    }).select('_id name email department position');
    
    const memberIds = teamMembers.map(m => m._id);
    
    const attendance = await require('../../models/attendance/attendanceDaily.model')
      .find({
        user: { $in: memberIds },
        date: today
      })
      .populate('user', 'name email department position')
      .populate('logs', 'type timestamp source')
      .lean();
    
    // Fill missing records
    const attendanceMap = new Map();
    attendance.forEach(a => attendanceMap.set(String(a.user._id), a));
    
    const completeData = teamMembers.map(member => {
      const record = attendanceMap.get(String(member._id));
      return record || {
        user: member,
        date: today,
        status: 'absent',
        totalWorkHours: 0,
        isLate: false,
        logs: []
      };
    });
    
    res.status(200).json({
      status: 'success',
      date: today,
      totalMembers: teamMembers.length,
      data: completeData
    });
  });
  
  // Get attendance summary
  getAttendanceSummary = catchAsync(async (req, res, next) => {
    const summary = await attendanceService.getAttendanceSummary(
      req.user.organizationId,
      req.query
    );
    
    res.status(200).json({
      status: 'success',
      data: summary
    });
  });
}

module.exports = new AttendanceController();