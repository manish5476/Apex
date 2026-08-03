const mongoose = require('mongoose');
const repo = require('../repository/geoFence.repository');
const User = require('../../../auth/core/user.model');
const Employee = require('../../core-hr/models/employee.model');
const AppError = require('../../../../core/utils/api/appError');

class GeoFenceService {

  // Pure Math Helper (Haversine formula)
  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async _validateUniqueness(orgId, payload, currentId = null) {
    if (payload.name || payload.code) {
      const exists = await repo.getByNameOrCode(orgId, payload.name, payload.code, currentId);
      if (exists) {
        if (exists.name === payload.name) throw new AppError('GeoFence name already exists', 400);
        if (exists.code === payload.code) throw new AppError('GeoFence code already exists', 400);
      }
    }
  }

  // --- CRUD ---

  async create(orgId, payload, actorId) {
    await this._validateUniqueness(orgId, payload);
    payload.createdBy = actorId;
    payload.updatedBy = actorId;
    return repo.create(orgId, payload);
  }

  async update(orgId, id, payload, actorId) {
    await this._validateUniqueness(orgId, payload, id);
    payload.updatedBy = actorId;
    const gf = await repo.updateById(orgId, id, payload);
    if (!gf) throw new AppError('GeoFence not found', 404);
    return gf;
  }

  async delete(orgId, id) {
    const geofence = await repo.getById(orgId, id);
    if (!geofence) throw new AppError('GeoFence not found', 404);

    const usersUsing = await User.countDocuments({ organizationId: orgId, 'attendanceConfig.geoFenceId': id });
    if (usersUsing > 0) throw new AppError(`Cannot delete geofence currently assigned to ${usersUsing} users.`, 400);

    await geofence.deleteOne();
  }

  // --- Geolocation ---

  async checkPoint(orgId, id, longitude, latitude) {
    const geofence = await repo.getById(orgId, id);
    if (!geofence || !geofence.isActive) throw new AppError('Active GeoFence not found', 404);

    let isInside = false;
    let distance = null;

    try {
      isInside = geofence.isPointInside(longitude, latitude);
    } catch (err) {
      throw new AppError(err.message, 501); // E.g., Polygon calculation unsupported
    }

    if (!isInside && geofence.type === 'circle' && geofence.center?.coordinates) {
      distance = this._calculateDistance(latitude, longitude, geofence.center.coordinates[1], geofence.center.coordinates[0]);
    }

    return { geofence: geofence.name, isInside, distance: distance !== null ? `${Math.round(distance)} meters` : null, location: { longitude, latitude } };
  }

  async findNearby(orgId, longitude, latitude, radius) {
    const geofences = await repo.findNearby(orgId, longitude, latitude, radius);
    
    const results = geofences.map(gf => ({
      _id: gf._id, name: gf.name, code: gf.code, type: gf.type, address: gf.address,
      distance: Math.round(gf.distanceFromPoint),
      isInside: gf.distanceFromPoint <= (gf.radius || 0)
    })).sort((a, b) => a.distance - b.distance);

    return results;
  }

  // --- Assignments (Transactions) ---

  async assignToUsers(orgId, id, userIds, actorId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const geofence = await repo.updateById(orgId, id, { applicableUsers: userIds, applicableToAll: false, updatedBy: actorId }, session);
      if (!geofence) throw new AppError('GeoFence not found', 404);

      await User.updateMany(
        { _id: { $in: userIds }, organizationId: orgId },
        { $set: { 'attendanceConfig.geoFenceId': geofence._id, 'attendanceConfig.enforceGeoFence': true } },
        { session }
      );

      await session.commitTransaction();
      return { geofence: geofence.name, assignedUsers: userIds.length };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async assignToDepartments(orgId, id, departmentIds, replace, actorId) {
    const geofence = await repo.getById(orgId, id);
    if (!geofence) throw new AppError('GeoFence not found', 404);

    const newDepts = replace ? departmentIds : [...new Set([...geofence.applicableDepartments.map(d => d.toString()), ...departmentIds])];

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await repo.updateById(orgId, id, { applicableDepartments: newDepts, applicableToAll: false, updatedBy: actorId }, session);

      // Map departments to users
      const employees = await Employee.find({ organizationId: orgId, departmentId: { $in: departmentIds } }).select('user').session(session);
      const userIds = employees.map(e => e.user);

      if (userIds.length) {
        await User.updateMany(
          { _id: { $in: userIds }, isActive: true },
          { $set: { 'attendanceConfig.geoFenceId': geofence._id, 'attendanceConfig.enforceGeoFence': true } },
          { session }
        );
      }

      await session.commitTransaction();
      return { geofence: geofence.name, assignedDepartments: departmentIds.length, affectedUsers: userIds.length };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // --- Analytics ---

  async getViolations(orgId, fromDate, toDate, userId) {
    const matchStage = { organizationId: orgId, 'location.geofenceStatus': 'outside', 'location.geofenceId': { $exists: true } };
    
    if (fromDate || toDate) {
      matchStage.timestamp = {};
      if (fromDate) matchStage.timestamp.$gte = new Date(fromDate);
      if (toDate) matchStage.timestamp.$lte = new Date(toDate);
    }
    if (userId) matchStage.user = new mongoose.Types.ObjectId(userId);

    const rawViolations = await repo.getViolations(matchStage);

    // Compute exact distance mathematically
    const violations = rawViolations.map(v => {
      let distance = null;
      if (v.userCoords?.length === 2 && v.geofence?.centerCoords?.length === 2) {
        distance = Math.round(this._calculateDistance(v.userCoords[1], v.userCoords[0], v.geofence.centerCoords[1], v.geofence.centerCoords[0]));
      }
      const { geofence, userCoords, ...rest } = v;
      return { ...rest, geofence: { _id: geofence._id, name: geofence.name }, distance: distance !== null ? `${distance} meters` : null };
    });

    const summary = {
      totalViolations: violations.length,
      uniqueUsers: new Set(violations.map(v => v.user._id.toString())).size,
      byGeofence: violations.reduce((acc, v) => { acc[v.geofence.name] = (acc[v.geofence.name] || 0) + 1; return acc; }, {}),
    };

    return { summary, violations };
  }
}

module.exports = new GeoFenceService();