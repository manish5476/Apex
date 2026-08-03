const AttendanceLog = require('../models/attendanceLog.model');
const GeoFence = require('../models/geoFencing.model');
const ApiFeatures = require('../../../../core/utils/api.utils');

class AttendanceLogRepository {

  async getList(orgId, queryString) {
    const features = new ApiFeatures(AttendanceLog.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['type', 'source', 'ipAddress'])
      .sort()
      .paginate()
      .populate([
        { path: 'user', select: 'name employeeProfile.employeeId' },
        { path: 'machineId', select: 'name serialNumber' }
      ]);
    return await features.execute();
  }

  async getById(orgId, id, session = null) {
    return AttendanceLog.findOne({ _id: id, organizationId: orgId }).session(session).populate([
      { path: 'user', select: 'name employeeProfile.employeeId email' },
      { path: 'machineId', select: 'name serialNumber providerType' },
      { path: 'verifiedBy', select: 'name' }
    ]);
  }

  async getRecentLog(userId, type, secondsTolerance = 30) {
    return AttendanceLog.findOne({
      user: userId,
      type: type,
      timestamp: { $gte: new Date(Date.now() - secondsTolerance * 1000) }
    }).lean();
  }

  async getActiveGeofences(orgId, branchId) {
    return GeoFence.find({
      organizationId: orgId,
      $or: [{ branchId }, { applicableToAll: true }],
      isActive: true,
    });
  }

  async getStatsAggregation(matchStage) {
    return AttendanceLog.aggregate([
      { $match: matchStage },
      {
        $facet: {
          bySource: [{ $group: { _id: '$source', count: { $sum:1 }, verified: { $sum:{ $cond:['$isVerified',1,0] } } } }],
          byType:   [{ $group: { _id: '$type',   count: { $sum:1 } } }],
          byStatus: [{ $group: { _id: '$processingStatus', count: { $sum:1 } } }],
          hourly:   [{ $group: { _id: { $hour: '$timestamp' }, count: { $sum:1 } } }, { $sort:{'_id':1} }],
          total: [
            { $group: { _id:null, totalLogs:{ $sum:1 }, verifiedLogs:{ $sum:{ $cond:['$isVerified',1,0] } }, uniqueUsers:{ $addToSet:'$user' } } },
            { $project: { totalLogs:1, verifiedLogs:1, verifiedPercentage:{ $multiply:[{ $divide:['$verifiedLogs','$totalLogs'] },100] }, uniqueUsers:{ $size:'$uniqueUsers' } } },
          ],
        },
      },
    ]);
  }

  async getRecentFeed(orgId, limit, since) {
    return AttendanceLog.find({ organizationId: orgId, timestamp: { $gte: since } })
      .populate('user', 'name employeeProfile.employeeId avatar')
      .populate('machineId', 'name')
      .sort('-timestamp')
      .limit(limit);
  }
}

module.exports = new AttendanceLogRepository();