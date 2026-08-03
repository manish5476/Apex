const AttendanceMachine = require('../models/attendanceMachine.model');
const AttendanceLog = require('../models/attendanceLog.model');
const User = require('../../../auth/core/user.model');
const ApiFeatures = require('../../../../core/utils/api.utils');

class AttendanceMachineRepository {
  
  async getList(orgId, queryString) {
    const features = new ApiFeatures(AttendanceMachine.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['name', 'serialNumber', 'model', 'ipAddress'])
      .sort()
      .paginate()
      .populate([
        { path: 'branchId', select: 'name address' },
        { path: 'createdBy', select: 'name' }
      ]);
    return await features.execute();
  }

  async getById(orgId, id, selectKeys = '') {
    return AttendanceMachine.findOne({ _id: id, organizationId: orgId }).select(selectKeys).populate([
      { path: 'branchId', select: 'name address phone' },
      { path: 'createdBy', select: 'name' }
    ]);
  }

  async getBySerialNumber(serialNumber) {
    return AttendanceMachine.findOne({ serialNumber });
  }

  async create(orgId, payload) {
    return AttendanceMachine.create({ ...payload, organizationId: orgId });
  }

  async updateById(orgId, id, payload) {
    return AttendanceMachine.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: payload },
      { new: true, runValidators: true }
    );
  }

  async deleteById(orgId, id) {
    return AttendanceMachine.findOneAndDelete({ _id: id, organizationId: orgId });
  }

  async getAnalyticsAggregation(orgId, startDate) {
    return AttendanceMachine.aggregate([
      { $match: { organizationId: orgId } },
      {
        $lookup: {
          from: 'attendancelogs',
          let: { machineId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$machineId', '$$machineId'] }, timestamp: { $gte: startDate } } },
            { $project: { user: 1, timestamp: 1 } },
          ],
          as: 'recentLogs',
        },
      },
      {
        $project: {
          name: 1, serialNumber: 1, status: 1, connectionStatus: 1, providerType: 1, branchId: 1, stats: 1,
          totalLogs: { $size: '$recentLogs' },
          lastLogAt: { $max: '$recentLogs.timestamp' },
          uniqueUserSet: { $setUnion: ['$recentLogs.user', []] },
        },
      },
      { $addFields: { uniqueUsers: { $size: '$uniqueUserSet' } } },
      {
        $facet: {
          summary: [
            { $group: { _id: null, totalMachines: { $sum: 1 }, activeMachines: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, onlineMachines: { $sum: { $cond: [{ $eq: ['$connectionStatus', 'online'] }, 1, 0] } }, totalLogs: { $sum: '$totalLogs' }, totalUniqueUsers: { $sum: '$uniqueUsers' } } },
          ],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 }, totalLogs: { $sum: '$totalLogs' } } }],
          byProvider: [{ $group: { _id: '$providerType', count: { $sum: 1 } } }],
          machines: [{ $sort: { totalLogs: -1 } }, { $project: { uniqueUserSet: 0 } }],
        },
      },
    ]);
  }
}

module.exports = new AttendanceMachineRepository();