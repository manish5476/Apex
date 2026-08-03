const GeoFence = require('../models/geoFencing.model');
const AttendanceLog = require('../models/attendanceLog.model');
const ApiFeatures = require('../../../../core/utils/api.utils');
const mongoose = require('mongoose');

class GeoFenceRepository {
  async getList(orgId, queryString) {
    const features = new ApiFeatures(GeoFence.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['name', 'code', 'address.line1', 'address.city'])
      .sort({ name: 1 })
      .paginate()
      .populate([
        { path: 'branchId', select: 'name' },
        { path: 'createdBy', select: 'name' }
      ]);
    return await features.execute();
  }

  async getById(orgId, id) {
    return GeoFence.findOne({ _id: id, organizationId: orgId }).populate([
      { path: 'branchId', select: 'name address' },
      { path: 'applicableUsers', select: 'name employeeProfile.employeeId' },
      { path: 'applicableDepartments', select: 'name' },
      { path: 'applicableDesignations', select: 'title' }
    ]);
  }

  async getByNameOrCode(orgId, name, code, excludeId = null) {
    const query = { organizationId: orgId, $or: [] };
    if (name) query.$or.push({ name });
    if (code) query.$or.push({ code });
    if (excludeId) query._id = { $ne: excludeId };
    return query.$or.length > 0 ? GeoFence.findOne(query) : null;
  }

  async create(orgId, payload) {
    return GeoFence.create({ ...payload, organizationId: orgId });
  }

  async updateById(orgId, id, payload, session = null) {
    return GeoFence.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: payload },
      { new: true, runValidators: true, session }
    );
  }

  // Uses MongoDB's native highly optimized C++ geospatial engine
  async findNearby(orgId, longitude, latitude, radius) {
    return GeoFence.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [longitude, latitude] },
          distanceField: 'distanceFromPoint',
          maxDistance: radius,
          spherical: true,
          query: { organizationId: orgId, isActive: true, type: 'circle' }
        }
      },
      { $limit: 20 },
      { $project: { name: 1, code: 1, type: 1, address: 1, radius: 1, distanceFromPoint: 1 } }
    ]);
  }

  async getAnalytics(orgId, geofenceId, startDate) {
    return AttendanceLog.aggregate([
      { $match: { organizationId: orgId, 'location.geofenceId': geofenceId, timestamp: { $gte: startDate } } },
      {
        $facet: {
          byStatus: [{ $group: { _id: '$location.geofenceStatus', count: { $sum: 1 } } }],
          byUser: [
            { $group: { _id: '$user', count: { $sum: 1 }, inside: { $sum: { $cond: [{ $eq: ['$location.geofenceStatus','inside'] }, 1, 0] } }, outside: { $sum: { $cond: [{ $eq: ['$location.geofenceStatus','outside'] }, 1, 0] } } } },
            { $sort: { count: -1 } }, { $limit: 10 }
          ],
          daily: [
            { $group: { _id: { year:{ $year:'$timestamp' }, month:{ $month:'$timestamp' }, day:{ $dayOfMonth:'$timestamp' } }, count:{ $sum:1 }, inside:{ $sum:{ $cond:[{ $eq:['$location.geofenceStatus','inside'] },1,0] } } } },
            { $sort: { '_id.year':1,'_id.month':1,'_id.day':1 } }
          ],
          total: [
            { $group: { _id:null, totalLogs:{ $sum:1 }, inside:{ $sum:{ $cond:[{ $eq:['$location.geofenceStatus','inside'] },1,0] } }, outside:{ $sum:{ $cond:[{ $eq:['$location.geofenceStatus','outside'] },1,0] } }, uniqueUsers:{ $addToSet:'$user' } } },
            { $project: { totalLogs:1, inside:1, outside:1, uniqueUsers:{ $size:'$uniqueUsers' }, complianceRate:{ $multiply:[{ $divide:['$inside','$totalLogs'] },100] } } }
          ]
        }
      }
    ]);
  }

  async getViolations(matchStage) {
    return AttendanceLog.aggregate([
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userInfo' } },
      { $unwind: '$userInfo' },
      { $lookup: { from: 'employees', localField: 'user', foreignField: 'user', as: 'empInfo' } },
      { $unwind: { path: '$empInfo', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'geofences', localField: 'location.geofenceId', foreignField: '_id', as: 'geofenceInfo' } },
      {
        $project: {
          timestamp: 1, type: 1,
          user: { _id: '$userInfo._id', name: '$userInfo.name', employeeId: '$empInfo.employeeId' },
          geofence: { _id: { $arrayElemAt: ['$geofenceInfo._id', 0] }, name: { $arrayElemAt: ['$geofenceInfo.name', 0] }, centerCoords: { $arrayElemAt: ['$geofenceInfo.center.coordinates', 0] } },
          userCoords: '$location.geoJson.coordinates'
        }
      },
      { $sort: { timestamp: -1 } },
      { $limit: 100 }
    ]);
  }
}

module.exports = new GeoFenceRepository();