const mongoose = require('mongoose');
const AttendanceDaily = require('../models/attendanceDaily.model');
const AttendanceLog = require('../models/attendanceLog.model');
const AttendanceRequest = require('../models/attendanceRequest.model');
const User = require('../../../auth/core/user.model');
const ApiFeatures = require('../../../../core/utils/api/ApiFeatures');
require('../../core-hr/models/employee.model');
require('../../core-hr/models/department.model');
require('../models/shift.model');
require('../../leave-management/models/holiday.model');

class AttendanceDailyRepository {

  // --- CRUD ---
  async getList(orgId, queryString) {
    const features = new ApiFeatures(AttendanceDaily.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['status'])
      .sort()
      .paginate()
      .populate([
        { path: 'user', select: 'name email avatar' },
        { path: 'shiftId', select: 'name startTime endTime' },
        { path: 'leaveRequestId', select: 'leaveType' },
        { path: 'holidayId', select: 'name' },
        { path: 'regularizedById', select: 'name' }
      ]);
    return await features.execute();
  }

  async getById(orgId, id) {
    return AttendanceDaily.findOne({ _id: id, organizationId: orgId }).populate([
      { path: 'user', select: 'name email phone avatar' },
      { path: 'shiftId', select: 'name startTime endTime gracePeriodMins' },
      { path: 'leaveRequestId', select: 'leaveType reason' },
      { path: 'holidayId', select: 'name description' },
      { path: 'logs', select: 'timestamp type source location' },
      { path: 'regularizedById', select: 'name' }
    ]);
  }

  // --- Aggregations mapped from your controller ---
  async getMyAttendanceSummary(query) {
    return AttendanceDaily.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          present: { $sum: { $cond: [{ $in: ['$status', ['present','late','half_day']] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          leave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } },
          holiday: { $sum: { $cond: [{ $eq: ['$status', 'holiday'] }, 1, 0] } },
          weekOff: { $sum: { $cond: [{ $eq: ['$status', 'week_off'] }, 1, 0] } },
          totalWorkHours: { $sum: '$totalWorkHours' },
          totalOvertime: { $sum: '$overtimeHours' },
        }
      }
    ]);
  }

  async getDashboardStats(orgId, dayStart, dayEnd) {
    return Promise.all([
      User.countDocuments({ organizationId: orgId, isActive: true, status: 'approved' }),
      AttendanceDaily.find({ organizationId: orgId, date: { $gte: dayStart, $lte: dayEnd } })
        .populate('user', 'name employeeProfile.employeeId employeeProfile.departmentId avatar'),
      AttendanceLog.countDocuments({ organizationId: orgId, timestamp: { $gte: dayStart, $lte: dayEnd } }),
      AttendanceRequest.countDocuments({ organizationId: orgId, status: 'pending' })
    ]);
  }

  async getDashboardDeptWise(orgId, dayStart, dayEnd) {
    return AttendanceDaily.aggregate([
      { $match: { organizationId: orgId, date: { $gte: dayStart, $lte: dayEnd } } },
      { $lookup: { from: 'employees', localField: 'user', foreignField: 'user', as: 'empInfo' } },
      { $unwind: { path: '$empInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$empInfo.departmentId',
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $in: ['$status', ['present','late','half_day']] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: ['$isLate', 1, 0] } },
        },
      },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
      { $addFields: { departmentName: { $ifNull: [{ $arrayElemAt: ['$dept.name', 0] }, 'General Department'] } } },
      { $project: { dept: 0 } }
    ]);
  }

  async getReportAggregation(matchStage, departmentId, userId) {
    const pipeline = [
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userInfo' } },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'employees', localField: 'user', foreignField: 'user', as: 'empInfo' } },
      { $unwind: { path: '$empInfo', preserveNullAndEmptyArrays: true } },
    ];

    if (departmentId) pipeline.push({ $match: { 'empInfo.departmentId': new mongoose.Types.ObjectId(departmentId) } });
    if (userId) pipeline.push({ $match: { 'userInfo._id': new mongoose.Types.ObjectId(userId) } });

    pipeline.push(
      {
        $group: {
          _id: '$user',
          employeeName: { $first: { $ifNull: ['$userInfo.name', { $concat: ['$empInfo.firstName', ' ', '$empInfo.lastName'] }] } },
          employeeId: { $first: { $ifNull: ['$empInfo.employeeId', '—'] } },
          departmentId: { $first: '$empInfo.departmentId' },
          totalDays: { $sum: 1 },
          present: { $sum: { $cond: [{ $in: ['$status', ['present','late','half_day']] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: ['$isLate', 1, 0] } },
          halfDay: { $sum: { $cond: ['$isHalfDay', 1, 0] } },
          onLeave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } },
          totalWorkHours: { $sum: '$totalWorkHours' },
          totalOvertime: { $sum: '$overtimeHours' },
        },
      },
      { $lookup: { from: 'departments', localField: 'departmentId', foreignField: '_id', as: 'department' } },
      {
        $addFields: {
          departmentName: { $ifNull: [{ $arrayElemAt: ['$department.name', 0] }, 'General Department'] },
          attendancePercentage: {
            $cond: [
              { $eq: ['$totalDays', 0] }, 0,
              { $round: [{ $multiply: [{ $divide: ['$present', '$totalDays'] }, 100] }, 1] },
            ],
          },
        },
      },
      { $project: { department: 0 } },
      { $sort: { departmentName: 1, employeeName: 1 } }
    );

    return AttendanceDaily.aggregate(pipeline);
  }

  async getTrendsAggregation(orgId, startDate, endDate) {
    return AttendanceDaily.aggregate([
      { $match: { organizationId: orgId, date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' }, day: { $dayOfMonth: '$date' } },
          date: { $first: '$date' },
          present: { $sum: { $cond: [{ $in: ['$status', ['present','late','half_day']] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: ['$isLate', 1, 0] } },
          total: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);
  }
}

module.exports = new AttendanceDailyRepository();