const mongoose = require('mongoose');
const AttendanceLog = require('./models/attendanceLog.model');
const AttendanceDaily = require('./models/attendanceDaily.model');
const Branch = require('../../organization/core/branch.model');
const AppError = require('../../../core/utils/appError');
const catchAsync = require('../../../core/utils/catchAsync');

const moment = require('moment'); // APEX FIX: Switched from dayjs

// Helper: Calculate distance between two coords (Haversine Formula)
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
};

/**
 * @desc   Manual Web/App Punch
 * @route  POST /api/v1/attendance/punch
 * @access Private (Logged In User)
 */
exports.markAttendance = catchAsync(async (req, res, next) => {
    const { type, latitude, longitude, accuracy } = req.body;
    const user = req.user; // From authMiddleware

    // 1. Permission Check
    if (!user.attendanceConfig?.allowWebPunch) {
        return next(new AppError('Web attendance is not enabled for your account.', 403));
    }

    // 2. Geo-Fencing Security
    let isGeoFenced = false;
    let distance = 0;

    if (user.attendanceConfig.enforceGeoFence) {
        if (!latitude || !longitude) {
            return next(new AppError('Location access is required to mark attendance.', 400));
        }

        // Fetch Branch Coordinates
        const branch = await Branch.findById(user.branchId);
        if (!branch || !branch.location?.coordinates) {
            return next(new AppError('Your branch location is not configured. Contact Admin.', 400));
        }

        // Expecting [lng, lat] in MongoDB GeoJSON
        const branchLat = branch.location.coordinates[1]; 
        const branchLng = branch.location.coordinates[0];

        distance = getDistance(latitude, longitude, branchLat, branchLng);
        const maxRadius = user.attendanceConfig.geoFenceRadius || 100;

        if (distance > maxRadius) {
            return next(new AppError(`You are ${Math.round(distance)}m away from office. Must be within ${maxRadius}m.`, 400));
        }
        isGeoFenced = true;
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const now = new Date();
        // APEX FIX: Use moment format
        const dateStr = moment(now).format('YYYY-MM-DD');

        // 3. Create Audit Log
        const log = new AttendanceLog({
            source: 'web',
            user: user._id,
            timestamp: now,
            type: type, // 'in' or 'out'
            location: { latitude, longitude, accuracy },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            isGeoFenced,
            distanceFromBranch: distance,
            processingStatus: 'processed'
        });
        await log.save({ session });

        // 4. Update Daily Record (Unified Logic)
        let daily = await AttendanceDaily.findOne({
            user: user._id,
            date: dateStr
        }).session(session);

        if (!daily) {
            daily = new AttendanceDaily({
                user: user._id,
                organizationId: user.organizationId,
                branchId: user.branchId,
                date: dateStr,
                firstIn: type === 'in' ? now : null,
                logs: [log._id],
                status: type === 'in' ? 'present' : 'absent'
            });
        } else {
            // Update First In
            if (type === 'in') {
                if (!daily.firstIn || now < daily.firstIn) daily.firstIn = now;
            }
            // Update Last Out
            if (type === 'out') {
                if (!daily.lastOut || now > daily.lastOut) daily.lastOut = now;
            }
            daily.logs.push(log._id);
        }

        // 5. Recalculate Hours
        if (daily.firstIn && daily.lastOut) {
            const diffMs = daily.lastOut - daily.firstIn;
            daily.totalWorkHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
        }

        await daily.save({ session });
        await session.commitTransaction();

        res.status(200).json({
            status: 'success',
            data: {
                type,
                time: now,
                distance: Math.round(distance) + 'm'
            }
        });

    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
})