const mongoose = require('mongoose');
const LeaveBalance = require('../models/leaveBalance.model');
const LeaveRequest = require('../models/leaveRequest.model');
const User = require('../../../auth/core/user.model');
const ApiFeatures = require('../../../../core/utils/api.utils');

class LeaveBalanceRepository {

  async getList(orgId, queryString) {
    const features = new ApiFeatures(LeaveBalance.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['financialYear'])
      .sort({ financialYear: -1 })
      .paginate()
      .populate([{ path: 'user', select: 'name employeeProfile.employeeId employeeProfile.departmentId' }]);
    return await features.execute();
  }

  async getById(orgId, id) {
    return LeaveBalance.findOne({ _id: id, organizationId: orgId })
      .populate('user', 'name employeeProfile employeeProfile.dateOfJoining email phone');
  }

  async getByUserAndYear(orgId, userId, financialYear, session = null) {
    return LeaveBalance.findOne({ user: userId, organizationId: orgId, financialYear }).session(session);
  }

  async getPendingLeaveDays(orgId, userId, leaveTypeEnum) {
    const pendingLeaves = await LeaveRequest.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(userId), 
          organizationId: new mongoose.Types.ObjectId(orgId), 
          leaveType: leaveTypeEnum, 
          status: 'pending', 
          startDate: { $gte: new Date() } 
        } 
      },
      { $group: { _id: null, totalDays: { $sum: '$daysCount' } } }
    ]);
    return pendingLeaves[0]?.totalDays || 0;
  }

  async getActiveUsersForAccrual(orgId, targetDate) {
    return User.find({
      organizationId: orgId,
      isActive: true,
      'employeeProfile.dateOfJoining': { $lte: targetDate }
    }).select('_id').lean();
  }

  // --- Analytics & Reports ---

  async getReportAggregation(orgId, financialYear, departmentId) {
    const pipeline = [
      { $match: { organizationId: orgId, financialYear } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userInfo' } },
      { $unwind: '$userInfo' },
      { $lookup: { from: 'employees', localField: 'user', foreignField: 'user', as: 'empInfo' } },
      { $unwind: '$empInfo' },
      { $match: { 'userInfo.isActive': true, 'userInfo.status': 'approved' } }
    ];

    if (departmentId) {
      pipeline.push({ $match: { 'empInfo.departmentId': new mongoose.Types.ObjectId(departmentId) } });
    }

    pipeline.push(
      {
        $project: {
          userId: '$userInfo._id',
          employeeName: '$userInfo.name',
          employeeId: '$empInfo.employeeId',
          department: '$empInfo.departmentId',
          designation: '$empInfo.designationId',
          dateOfJoining: '$empInfo.dateOfJoining',
          casualLeave: { total: '$casualLeave.total', used: '$casualLeave.used', available: { $subtract: ['$casualLeave.total', '$casualLeave.used'] } },
          sickLeave: { total: '$sickLeave.total', used: '$sickLeave.used', available: { $subtract: ['$sickLeave.total', '$sickLeave.used'] } },
          earnedLeave: { total: '$earnedLeave.total', used: '$earnedLeave.used', available: { $subtract: ['$earnedLeave.total', '$earnedLeave.used'] } },
          totalAvailable: { $add: [{ $subtract: ['$casualLeave.total','$casualLeave.used'] }, { $subtract: ['$sickLeave.total','$sickLeave.used'] }, { $subtract: ['$earnedLeave.total','$earnedLeave.used'] }] }
        }
      },
      { $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'deptInfo' } },
      { $lookup: { from: 'designations', localField: 'designation', foreignField: '_id', as: 'desigInfo' } },
      { $addFields: { departmentName: { $arrayElemAt: ['$deptInfo.name', 0] }, designationTitle: { $arrayElemAt: ['$desigInfo.title', 0] } } },
      { $project: { deptInfo: 0, desigInfo: 0 } },
      { $sort: { departmentName: 1, employeeName: 1 } }
    );

    return LeaveBalance.aggregate(pipeline);
  }

  async getYearlyTrends(orgId, financialYears) {
    return LeaveBalance.aggregate([
      { $match: { organizationId: orgId, financialYear: { $in: financialYears } } },
      { $group: { _id: '$financialYear', totalCasual: { $sum: '$casualLeave.used' }, totalSick: { $sum: '$sickLeave.used' }, totalEarned: { $sum: '$earnedLeave.used' }, employeeCount: { $sum: 1 }, avgCasual: { $avg: '$casualLeave.used' }, avgSick: { $avg: '$sickLeave.used' }, avgEarned: { $avg: '$earnedLeave.used' } } },
      { $sort: { _id: -1 } }
    ]);
  }

  async getMonthlyUsage(orgId, startDate, endDate) {
    return LeaveRequest.aggregate([
      { $match: { organizationId: orgId, status: 'approved', startDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $month: '$startDate' }, count: { $sum: 1 }, days: { $sum: '$daysCount' } } },
      { $sort: { _id: 1 } }
    ]);
  }
}

module.exports = new LeaveBalanceRepository();