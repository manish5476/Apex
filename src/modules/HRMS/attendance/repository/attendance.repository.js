const AttendanceLog = require('../models/attendanceLog.model');
const AttendanceDaily = require('../models/attendanceDaily.model');
const GeoFence = require('../models/geoFencing.model');
const ApiFeatures = require('../../../../core/utils/api/ApiFeatures');

class AttendanceRepository {
  
  async getRecentLog(orgId, userId, type, withinSeconds = 30) {
    const cutoff = new Date(Date.now() - (withinSeconds * 1000));
    return AttendanceLog.findOne({
      user: userId,
      organizationId: orgId,
      type: type,
      timestamp: { $gte: cutoff }
    }).lean();
  }

  // Uses MongoDB native geospatial query for accurate Geofence checking (supports Polygons & Circles natively)
  async findEnclosingGeofence(orgId, longitude, latitude, userId, departmentId) {
    const point = { type: 'Point', coordinates: [longitude, latitude] };

    // Find any active geofence this point intersects with
    return GeoFence.findOne({
      organizationId: orgId,
      isActive: true,
      $or: [
        { 'center': { $geoIntersects: { $geometry: point } } },
        { 'polygon': { $geoIntersects: { $geometry: point } } }
      ],
      // Check applicability
      $or: [
        { applicableToAll: true },
        { applicableUsers: userId },
        { applicableDepartments: departmentId }
      ]
    }).lean();
  }

  async createLog(payload, session) {
    const docs = await AttendanceLog.create([payload], { session });
    return docs[0];
  }

  async getDailyRecord(orgId, userId, dateStart, dateEnd, session) {
    return AttendanceDaily.findOne({
      user: userId,
      organizationId: orgId,
      date: { $gte: dateStart, $lte: dateEnd }
    }).session(session);
  }

  async createDailyRecord(payload, session) {
    const docs = await AttendanceDaily.create([payload], { session });
    return docs[0];
  }
}

module.exports = new AttendanceRepository();