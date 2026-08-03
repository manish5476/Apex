const catchAsync = require('../../../../core/utils/api/catchAsync');
const repo = require('../repository/geoFence.repository');
const geoFenceService = require('../services/geoFence.service');
const { createGeoFenceSchema, updateGeoFenceSchema, pointCheckSchema, assignUsersSchema, assignDepartmentsSchema } = require('../validation/geoFence.validation');
const { success, created, noContent } = require('../../middleware/responseFormatter');
const AppError = require('../../../../core/utils/api/appError');
const User = require('../../../auth/core/user.model'); // For analytics count

// --- CRUD ---

exports.createGeoFence = catchAsync(async (req, res) => {
  const payload = createGeoFenceSchema.parse(req.body);
  const geofence = await geoFenceService.create(req.user.organizationId, payload, req.user._id);
  return created(res, { geofence });
});

exports.getAllGeoFences = catchAsync(async (req, res) => {
  const result = await repo.getList(req.user.organizationId, req.query);
  return success(res, result.data, 200, result.pagination);
});

exports.getGeoFence = catchAsync(async (req, res, next) => {
  const geofence = await repo.getById(req.user.organizationId, req.params.id);
  if (!geofence) return next(new AppError('GeoFence not found', 404));
  return success(res, { geofence });
});

exports.updateGeoFence = catchAsync(async (req, res) => {
  const payload = updateGeoFenceSchema.parse(req.body);
  const geofence = await geoFenceService.update(req.user.organizationId, req.params.id, payload, req.user._id);
  return success(res, { geofence });
});

exports.deleteGeoFence = catchAsync(async (req, res) => {
  await geoFenceService.delete(req.user.organizationId, req.params.id);
  return noContent(res);
});

// --- Geolocation Checks ---

exports.checkPoint = catchAsync(async (req, res) => {
  const payload = pointCheckSchema.parse(req.body);
  const result = await geoFenceService.checkPoint(req.user.organizationId, req.params.id, payload.longitude, payload.latitude);
  return success(res, result);
});

exports.findNearby = catchAsync(async (req, res) => {
  const payload = pointCheckSchema.parse(req.body);
  const geofences = await geoFenceService.findNearby(req.user.organizationId, payload.longitude, payload.latitude, payload.radius || 1000);
  return success(res, { geofences }, 200, { total: geofences.length });
});

// --- Assignments ---

exports.assignToUsers = catchAsync(async (req, res) => {
  const payload = assignUsersSchema.parse(req.body);
  const result = await geoFenceService.assignToUsers(req.user.organizationId, req.params.id, payload.userIds, req.user._id);
  return success(res, result);
});

exports.assignToDepartments = catchAsync(async (req, res) => {
  const payload = assignDepartmentsSchema.parse(req.body);
  const result = await geoFenceService.assignToDepartments(req.user.organizationId, req.params.id, payload.departmentIds, payload.replace, req.user._id);
  return success(res, result);
});

// --- Analytics ---

exports.getGeofenceStats = catchAsync(async (req, res, next) => {
  const geofence = await repo.getById(req.user.organizationId, req.params.id);
  if (!geofence) return next(new AppError('GeoFence not found', 404));

  const days = Math.min(parseInt(req.query.days) || 30, 365);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [stats] = await repo.getAnalytics(req.user.organizationId, geofence._id, startDate);
  const assignedUsers = await User.countDocuments({ organizationId: req.user.organizationId, 'attendanceConfig.geoFenceId': geofence._id });

  return success(res, { 
    geofence: { _id: geofence._id, name: geofence.name, code: geofence.code }, 
    assignedUsers, 
    period: `${days} days`, 
    stats 
  });
});

exports.getViolations = catchAsync(async (req, res) => {
  const result = await geoFenceService.getViolations(req.user.organizationId, req.query.fromDate, req.query.toDate, req.query.userId);
  return success(res, result);
});

// // controllers/attendance/geoFence.controller.js
// const mongoose    = require('mongoose');
// const GeoFence    = require('../../attendance/models/geoFencing.model');
// const AttendanceLog = require('../../attendance/models/attendanceLog.model');
// const User        = require('../../../auth/core/user.model');
// const Employee    = require('../../core-hr/models/employee.model');
// const catchAsync  = require('../../../../core/utils/api/catchAsync');
// const AppError    = require('../../../../core/utils/api/appError');
// const factory     = require('../../../../core/utils/api/handlerFactory');
// const {
//   startOfDay, endOfDay, dateRangeQuery, parseQueryDate, isValidDateRange
// } = require('../../../../core/utils/dateHelpers.js');

// // ─────────────────────────────────────────────
// //  HELPERS
// // FIX BUG-GF-C01 [CRITICAL] — calculateDistance declared BEFORE first use.
// // Original was a `const` arrow function declared AFTER the code that called it.
// // Arrow functions are NOT hoisted (Temporal Dead Zone) → ReferenceError at runtime.
// // ─────────────────────────────────────────────

// /**
//  * Haversine formula — accurate great-circle distance in meters.
//  * @param {number} lat1
//  * @param {number} lon1
//  * @param {number} lat2
//  * @param {number} lon2
//  * @returns {number} distance in meters
//  */
// function calculateDistance(lat1, lon1, lat2, lon2) {
//   // FIX BUG-GF-C02 — Uses correct Haversine formula (not Pythagorean approximation).
//   // Original $function used: `Math.sqrt(Math.pow(lat1-lat2,2)+Math.pow(lon1-lon2,2))*111000`
//   // — this treats degrees as a flat Euclidean plane, with ~11% error at equator,
//   //   growing to >50% at higher latitudes.
//   const R  = 6371e3;
//   const φ1 = lat1 * Math.PI / 180;
//   const φ2 = lat2 * Math.PI / 180;
//   const Δφ = (lat2 - lat1) * Math.PI / 180;
//   const Δλ = (lon2 - lon1) * Math.PI / 180;

//   const a = Math.sin(Δφ / 2) ** 2 +
//             Math.cos(φ1) * Math.cos(φ2) *
//             Math.sin(Δλ / 2) ** 2;

//   return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
// }

// const validateGeoFenceData = async (data, organizationId, excludeId = null) => {
//   if (data.name) {
//     const nameExists = await GeoFence.findOne({ organizationId, name: data.name, _id: { $ne: excludeId } });
//     if (nameExists) throw new AppError('GeoFence with this name already exists', 400);
//   }
//   if (data.code) {
//     const codeExists = await GeoFence.findOne({ organizationId, code: data.code, _id: { $ne: excludeId } });
//     if (codeExists) throw new AppError('GeoFence with this code already exists', 400);
//   }

//   if (data.type === 'circle') {
//     if (!data.center?.coordinates || data.center.coordinates.length !== 2) {
//       throw new AppError('Circle type requires center coordinates [longitude, latitude]', 400);
//     }
//     const [lon, lat] = data.center.coordinates;
//     if (lon < -180 || lon > 180) throw new AppError('Longitude must be between -180 and 180', 400);
//     if (lat < -90  || lat > 90)  throw new AppError('Latitude must be between -90 and 90', 400);
//     if (!data.radius || data.radius < 10) throw new AppError('Circle type requires radius >= 10 meters', 400);
//   }

//   if (data.type === 'polygon') {
//     if (!data.polygon?.coordinates?.length) throw new AppError('Polygon type requires valid coordinates', 400);
//   }
// };

// // ─────────────────────────────────────────────
// //  CRUD
// // ─────────────────────────────────────────────

// exports.createGeoFence = catchAsync(async (req, res, next) => {
//   req.body.organizationId = req.user.organizationId;
//   req.body.createdBy      = req.user._id;
//   req.body.updatedBy      = req.user._id;

//   await validateGeoFenceData(req.body, req.user.organizationId);

//   const geofence = await GeoFence.create(req.body);
//   res.status(201).json({ status: 'success', data: { geofence } });
// });

// exports.getAllGeoFences = factory.getAll(GeoFence, {
//   searchFields: ['name', 'code', 'address.line1', 'address.city'],
//   populate:     [{ path: 'branchId', select: 'name' }, { path: 'createdBy', select: 'name' }],
//   sort:         { name: 1 },
//   includeInactive: true,
// });

// exports.getGeoFence = factory.getOne(GeoFence, {
//   populate: [
//     { path: 'branchId',                select: 'name address' },
//     { path: 'applicableUsers',         select: 'name employeeProfile.employeeId' },
//     { path: 'applicableDepartments',   select: 'name' },
//     { path: 'applicableDesignations',  select: 'title' },
//     { path: 'createdBy',               select: 'name' },
//   ],
// });

// exports.updateGeoFence = catchAsync(async (req, res, next) => {
//   const geofence = await GeoFence.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!geofence) return next(new AppError('GeoFence not found', 404));

//   if (req.body.name || req.body.code) {
//     await validateGeoFenceData(req.body, req.user.organizationId, req.params.id);
//   }

//   req.body.updatedBy = req.user._id;
//   const updated = await GeoFence.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
//   res.status(200).json({ status: 'success', data: { geofence: updated } });
// });

// exports.deleteGeoFence = catchAsync(async (req, res, next) => {
//   const geofence = await GeoFence.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!geofence) return next(new AppError('GeoFence not found', 404));

//   const usersUsing = await User.countDocuments({ organizationId: req.user.organizationId, 'attendanceConfig.geoFenceId': geofence._id });
//   if (usersUsing > 0) return next(new AppError(`Cannot delete geofence used by ${usersUsing} users`, 400));

//   await geofence.deleteOne();
//   res.status(204).json({ status: 'success', data: null });
// });

// // ─────────────────────────────────────────────
// //  GEOLOCATION OPERATIONS
// // ─────────────────────────────────────────────

// exports.checkPoint = catchAsync(async (req, res, next) => {
//   const { longitude, latitude } = req.body;
//   if (longitude === undefined || latitude === undefined || longitude === null || latitude === null) {
//     return next(new AppError('Please provide longitude and latitude', 400));
//   }

//   const geofence = await GeoFence.findOne({ _id: req.params.id, organizationId: req.user.organizationId, isActive: true });
//   if (!geofence) return next(new AppError('GeoFence not found', 404));

//   let isInside = false;
//   let distance = null;

//   try {
//     isInside = geofence.isPointInside(longitude, latitude);
//   } catch (err) {
//     // Polygon types throw NotImplemented from the model — calculate via MongoDB instead
//     return next(new AppError(err.message, 501));
//   }

//   if (!isInside && geofence.type === 'circle' && geofence.center?.coordinates) {
//     distance = calculateDistance(
//       latitude, longitude,
//       geofence.center.coordinates[1],
//       geofence.center.coordinates[0]
//     );
//   }

//   res.status(200).json({
//     status: 'success',
//     data: {
//       geofence: geofence.name,
//       isInside,
//       distance: distance !== null ? `${Math.round(distance)} meters` : null,
//       location: { longitude, latitude },
//     },
//   });
// });

// /**
//  * POST /api/v1/attendance/geofences/nearby
//  *
//  * FIX BUG-GF-C03 [CRITICAL] — Removed $near inside $or (invalid MongoDB — throws error).
//  * MongoDB does not support $near inside $or expressions.
//  * Replaced with $geoNear aggregation stage (correct approach).
//  */
// exports.findNearby = catchAsync(async (req, res, next) => {
//   const { longitude, latitude, radius = 1000 } = req.body;
//   if (longitude === undefined || latitude === undefined || longitude === null || latitude === null) {
//     return next(new AppError('Please provide longitude and latitude', 400));
//   }

//   // FIX BUG-GF-C03 — Use $geoNear aggregation (supports filters + distance output).
//   // Original used $near inside $or which MongoDB explicitly prohibits.
//   const geofences = await GeoFence.aggregate([
//     {
//       $geoNear: {
//         near:           { type: 'Point', coordinates: [longitude, latitude] },
//         distanceField:  'distanceFromPoint',
//         maxDistance:    radius,
//         spherical:      true,
//         query: {
//           organizationId: req.user.organizationId,
//           isActive:       true,
//           type:           'circle', // Only circle types support this query
//         },
//       },
//     },
//     { $limit: 20 },
//     {
//       $project: {
//         name:              1,
//         code:              1,
//         type:              1,
//         address:           1,
//         radius:            1,
//         distanceFromPoint: 1,
//       },
//     },
//   ]);

//   const results = geofences.map(gf => ({
//     _id:      gf._id,
//     name:     gf.name,
//     code:     gf.code,
//     type:     gf.type,
//     address:  gf.address,
//     distance: Math.round(gf.distanceFromPoint),
//     isInside: gf.distanceFromPoint <= (gf.radius || 0),
//   }));

//   results.sort((a, b) => a.distance - b.distance);

//   res.status(200).json({ status: 'success', results: results.length, data: { geofences: results } });
// });

// // ─────────────────────────────────────────────
// //  APPLICABILITY MANAGEMENT
// // ─────────────────────────────────────────────

// exports.assignToUsers = catchAsync(async (req, res, next) => {
//   const { userIds } = req.body;
//   if (!userIds?.length) return next(new AppError('Please provide user IDs', 400));

//   const geofence = await GeoFence.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!geofence) return next(new AppError('GeoFence not found', 404));

//   geofence.applicableUsers  = userIds;
//   geofence.applicableToAll  = false;
//   geofence.updatedBy        = req.user._id;
//   await geofence.save();

//   await User.updateMany(
//     { _id: { $in: userIds }, organizationId: req.user.organizationId },
//     { $set: { 'attendanceConfig.geoFenceId': geofence._id, 'attendanceConfig.enforceGeoFence': true } }
//   );

//   res.status(200).json({ status: 'success', data: { geofence: geofence.name, assignedUsers: userIds.length } });
// });

// /**
//  * POST /api/v1/attendance/geofences/:id/assign-departments
//  *
//  * FIX BUG-GF-C06 [HIGH] — Uses $addToSet to merge departments instead of overwriting.
//  * Original replaced applicableDepartments entirely on each call.
//  */
// exports.assignToDepartments = catchAsync(async (req, res, next) => {
//   const { departmentIds, replace = false } = req.body;
//   if (!departmentIds?.length) return next(new AppError('Please provide department IDs', 400));

//   const geofence = await GeoFence.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!geofence) return next(new AppError('GeoFence not found', 404));

//   if (replace) {
//     // Explicit replace mode — document this to callers
//     geofence.applicableDepartments = departmentIds;
//   } else {
//     // FIX BUG-GF-C06 — Merge, don't overwrite
//     const existing = new Set(geofence.applicableDepartments.map(id => id.toString()));
//     departmentIds.forEach(id => existing.add(id.toString()));
//     geofence.applicableDepartments = [...existing];
//   }

//   geofence.applicableToAll = false;
//   geofence.updatedBy       = req.user._id;
//   await geofence.save();

//   const employees = await Employee.find({
//     organizationId: req.user.organizationId,
//     departmentId: { $in: departmentIds },
//   }).select('user');

//   const userIds = employees.map(e => e.user);

//   if (userIds.length) {
//     await User.updateMany(
//       { _id: { $in: userIds }, isActive: true },
//       { $set: { 'attendanceConfig.geoFenceId': geofence._id, 'attendanceConfig.enforceGeoFence': true } }
//     );
//   }

//   res.status(200).json({
//     status: 'success',
//     data: { geofence: geofence.name, assignedDepartments: departmentIds.length, affectedUsers: userIds.length },
//   });
// });

// // ─────────────────────────────────────────────
// //  REPORTS & ANALYTICS
// // ─────────────────────────────────────────────

// exports.getGeofenceStats = catchAsync(async (req, res, next) => {
//   const geofence = await GeoFence.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!geofence) return next(new AppError('GeoFence not found', 404));

//   const days      = Math.min(parseInt(req.query.days) || 30, 365);
//   const startDate = new Date();
//   startDate.setDate(startDate.getDate() - days);

//   const stats = await AttendanceLog.aggregate([
//     { $match: { organizationId: req.user.organizationId, 'location.geofenceId': geofence._id, timestamp: { $gte: startDate } } },
//     {
//       $facet: {
//         byStatus: [{ $group: { _id: '$location.geofenceStatus', count: { $sum: 1 } } }],
//         byUser:   [
//           { $group: { _id: '$user', count: { $sum: 1 }, inside: { $sum: { $cond: [{ $eq: ['$location.geofenceStatus','inside'] }, 1, 0] } }, outside: { $sum: { $cond: [{ $eq: ['$location.geofenceStatus','outside'] }, 1, 0] } } } },
//           { $sort: { count: -1 } }, { $limit: 10 },
//         ],
//         daily: [
//           { $group: { _id: { year:{ $year:'$timestamp' }, month:{ $month:'$timestamp' }, day:{ $dayOfMonth:'$timestamp' } }, count:{ $sum:1 }, inside:{ $sum:{ $cond:[{ $eq:['$location.geofenceStatus','inside'] },1,0] } } } },
//           { $sort: { '_id.year':1,'_id.month':1,'_id.day':1 } },
//         ],
//         total: [
//           { $group: { _id:null, totalLogs:{ $sum:1 }, inside:{ $sum:{ $cond:[{ $eq:['$location.geofenceStatus','inside'] },1,0] } }, outside:{ $sum:{ $cond:[{ $eq:['$location.geofenceStatus','outside'] },1,0] } }, uniqueUsers:{ $addToSet:'$user' } } },
//           { $project: { totalLogs:1, inside:1, outside:1, uniqueUsers:{ $size:'$uniqueUsers' }, complianceRate:{ $multiply:[{ $divide:['$inside','$totalLogs'] },100] } } },
//         ],
//       },
//     },
//   ]);

//   const assignedUsers = await User.countDocuments({ organizationId: req.user.organizationId, 'attendanceConfig.geoFenceId': geofence._id });

//   res.status(200).json({
//     status: 'success',
//     data: { geofence: { _id: geofence._id, name: geofence.name, code: geofence.code }, assignedUsers, period: `${days} days`, stats: stats[0] },
//   });
// });

// /**
//  * GET /api/v1/attendance/geofences/violations
//  *
//  * FIX BUG-GF-C02 [CRITICAL] — Removed $function (MongoDB server-side JS).
//  * $function requires --enableJavaScriptEngine (disabled in Atlas by default).
//  * Distance is now computed in JavaScript after the aggregation.
//  */
// exports.getViolations = catchAsync(async (req, res, next) => {
//   const { fromDate, toDate } = req.query;

//   const matchStage = {
//     organizationId:          req.user.organizationId,
//     'location.geofenceStatus': 'outside',
//     'location.geofenceId':   { $exists: true },
//   };

//   if (fromDate || toDate) {
//     matchStage.timestamp = {};
//     const from = parseQueryDate(fromDate);
//     const to   = parseQueryDate(toDate);
//     if (from) matchStage.timestamp.$gte = from;
//     if (to)   matchStage.timestamp.$lte = to;
//   }

//   if (req.query.userId) {
//     matchStage.user = new mongoose.Types.ObjectId(req.query.userId);
//   }

//   // FIX BUG-GF-C02 — No $function. Aggregate raw data, compute distance in JS.
//   const rawViolations = await AttendanceLog.aggregate([
//     { $match: matchStage },
//     { $lookup: { from: 'users',     localField: 'user',               foreignField: '_id', as: 'userInfo'     } },
//     { $unwind: '$userInfo' },
//     { $lookup: { from: 'employees', localField: 'user',               foreignField: 'user', as: 'empInfo'     } },
//     { $unwind: { path: '$empInfo', preserveNullAndEmptyArrays: true } },
//     { $lookup: { from: 'geofences', localField: 'location.geofenceId', foreignField: '_id', as: 'geofenceInfo' } },
//     {
//       $project: {
//         timestamp: 1,
//         type:      1,
//         user: { _id: '$userInfo._id', name: '$userInfo.name', employeeId: '$empInfo.employeeId' },
//         geofence: { _id: { $arrayElemAt: ['$geofenceInfo._id', 0] }, name: { $arrayElemAt: ['$geofenceInfo.name', 0] }, centerCoords: { $arrayElemAt: ['$geofenceInfo.center.coordinates', 0] } },
//         // FIX BUG-GF-C02 — store coordinates for JS-side distance calculation
//         userCoords: '$location.geoJson.coordinates',
//       },
//     },
//     { $sort: { timestamp: -1 } },
//     { $limit: 100 },
//   ]);

//   // Compute distance in JavaScript (no $function, no Atlas restriction)
//   const violations = rawViolations.map(v => {
//     let distance = null;
//     if (v.userCoords?.length === 2 && v.geofence?.centerCoords?.length === 2) {
//       distance = Math.round(
//         calculateDistance(
//           v.userCoords[1],          v.userCoords[0],
//           v.geofence.centerCoords[1], v.geofence.centerCoords[0]
//         )
//       );
//     }
//     const { geofence, userCoords, ...rest } = v;
//     return { ...rest, geofence: { _id: geofence._id, name: geofence.name }, distance: distance !== null ? `${distance} meters` : null };
//   });

//   const summary = {
//     totalViolations: violations.length,
//     uniqueUsers:     new Set(violations.map(v => v.user._id.toString())).size,
//     byGeofence:      violations.reduce((acc, v) => { acc[v.geofence.name] = (acc[v.geofence.name] || 0) + 1; return acc; }, {}),
//   };

//   res.status(200).json({ status: 'success', data: { summary, violations } });
// });
