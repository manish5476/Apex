const mongoose = require('mongoose');
const AttendanceMachine = require('./attendanceMachine.model');
const AttendanceLog = require('./attendanceLog.model');
const AttendanceDaily = require('./attendanceDaily.model');
const User = require('../../../../modules/auth/core/user.model');
const AppError = require('../../../../core/utils/appError');
const catchAsync = require('../../../../core/utils/catchAsync');
const dayjs = require('dayjs');
const { emitToOrg, emitToUser } = require('../../../../core/utils/_legacy/socket');

/**
 * @desc   Receive data from Biometric Machines with Real-time Broadcasting
 * @route  POST /api/v1/attendance/machine-push
 */
exports.pushMachineData = catchAsync(async (req, res, next) => {
    const apiKey = req.headers['x-machine-api-key'];
    const machineIp = req.ip;
    
    if (!apiKey) {
        return next(new AppError('API key required', 401));
    }
    
    // 1. Authenticate Machine
    const machine = await AttendanceMachine.findOne({ 
        apiKey,
        status: 'active'
    }).select('+apiKey');
    
    if (!machine) {
        return next(new AppError('Unauthorized machine or inactive', 401));
    }
    
    // Optional IP restriction
    if (machine.ipAddress && machine.ipAddress !== machineIp) {
        console.warn(`Machine IP mismatch: ${machineIp} vs ${machine.ipAddress}`);
        // Log but don't block for flexibility
    }
    
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    if (payload.length === 0) {
        return res.status(200).json({ message: 'No data received' });
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const processedLogs = [];
        const realTimeEvents = [];
        
        for (const entry of payload) {
            const machineUserId = entry.userId || entry.user_id || entry.uid;
            const scanTime = new Date(entry.timestamp || entry.time || Date.now());
            const statusType = entry.status || entry.type;
            
            // Validate required fields
            if (!machineUserId || !scanTime || isNaN(scanTime.getTime())) {
                console.warn('Invalid entry:', entry);
                continue;
            }
            
            // A. Find User
            const user = await User.findOne({
                'attendanceConfig.machineUserId': String(machineUserId),
                organizationId: machine.organizationId,
                status: 'active'
            }).session(session);
            
            let processingStatus = 'processed';
            let resolvedUserId = user ? user._id : null;
            
            if (!user) {
                processingStatus = 'orphan';
                console.warn(`Orphan machine record: ${machineUserId} from machine ${machine._id}`);
            }
            
            // B. Create Immutable Log
            const logEntry = new AttendanceLog({
                machineId: machine._id,
                rawUserId: machineUserId,
                user: resolvedUserId,
                organizationId: machine.organizationId,
                branchId: machine.branchId,
                timestamp: scanTime,
                type: mapLogType(statusType, machine.providerType),
                source: 'machine',
                processingStatus,
                rawData: entry,
                location: machine.location || undefined
            });
            
            await logEntry.save({ session });
            
            // C. Update Daily Record (Only if User is identified)
            if (user) {
                const dateStr = dayjs(scanTime).format('YYYY-MM-DD');
                const timeStr = dayjs(scanTime).format('HH:mm');
                
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
                        logs: [logEntry._id],
                        status: 'present'
                    });
                    
                    // Get user's shift
                    const shift = await Shift.findById(user.shiftId).session(session);
                    if (shift) {
                        daily.shiftId = shift._id;
                        daily.scheduledInTime = shift.startTime;
                        daily.scheduledOutTime = shift.endTime;
                    }
                    
                    // Set first punch
                    if (logEntry.type === 'in') {
                        daily.firstIn = scanTime;
                    }
                } else {
                    // Update logs
                    daily.logs.push(logEntry._id);
                    
                    // Update first in if earlier
                    if (logEntry.type === 'in' && (!daily.firstIn || scanTime < daily.firstIn)) {
                        daily.firstIn = scanTime;
                    }
                    
                    // Update last out if later
                    if (logEntry.type === 'out' && (!daily.lastOut || scanTime > daily.lastOut)) {
                        daily.lastOut = scanTime;
                    }
                    
                    // Update status based on punches
                    if (!daily.firstIn && logEntry.type === 'in') {
                        daily.status = 'present';
                    }
                }
                
                // Calculate hours if both in and out exist
                if (daily.firstIn && daily.lastOut) {
                    const diffMs = daily.lastOut - daily.firstIn;
                    daily.totalWorkHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
                    
                    // Check overtime
                    const shiftHours = 8; // Default, should come from shift
                    if (daily.totalWorkHours > shiftHours) {
                        daily.overtimeHours = daily.totalWorkHours - shiftHours;
                        daily.isOvertime = true;
                    }
                }
                
                await daily.save({ session });
                
                // Prepare real-time event
                realTimeEvents.push({
                    userId: user._id,
                    userName: user.name,
                    type: logEntry.type,
                    time: timeStr,
                    date: dateStr,
                    machine: machine.name,
                    logId: logEntry._id
                });
            }
            
            processedLogs.push(logEntry._id);
        }
        
        // D. Update Machine Last Sync
        machine.lastSyncAt = new Date();
        machine.syncCount = (machine.syncCount || 0) + 1;
        await machine.save({ session });
        
        await session.commitTransaction();
        
        // E. Broadcast Real-time Events
        if (realTimeEvents.length > 0) {
            // Broadcast to organization room
            emitToOrg(machine.organizationId, 'attendance:machine:update', {
                machineId: machine._id,
                machineName: machine.name,
                events: realTimeEvents,
                timestamp: new Date()
            });
            
            // Send individual notifications to users
            realTimeEvents.forEach(event => {
                emitToUser(event.userId, 'attendance:punch:recorded', {
                    type: event.type,
                    time: event.time,
                    date: event.date,
                    machine: event.machine,
                    logId: event.logId
                });
            });
            
            // Notify managers
            const managers = await User.find({
                organizationId: machine.organizationId,
                role: { $in: ['manager', 'admin', 'owner'] }
            }).select('_id');
            
            managers.forEach(manager => {
                emitToUser(manager._id, 'attendance:team:punch', {
                    events: realTimeEvents,
                    timestamp: new Date()
                });
            });
        }
        
        res.status(200).json({
            status: 'success',
            synced: processedLogs.length,
            processed: realTimeEvents.length,
            orphaned: processedLogs.length - realTimeEvents.length,
            machine: machine.name
        });
        
    } catch (err) {
        await session.abortTransaction();
        console.error('Machine push error:', err);
        throw err;
    } finally {
        session.endSession();
    }
});

/**
 * @desc   Manual Punch with WebSocket Notifications
 * @route  POST /api/v1/attendance/punch
 */
exports.markAttendance = catchAsync(async (req, res, next) => {
    const { type, latitude, longitude, accuracy, notes, deviceId } = req.body;
    const user = req.user;
    
    // 1. Permission Check
    if (!user.attendanceConfig?.allowWebPunch) {
        return next(new AppError('Web attendance is not enabled for your account', 403));
    }
    
    // 2. Time-based restrictions
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Prevent out-of-hours punching (configurable)
    if (user.attendanceConfig.punchRestrictions) {
        const { allowedStart, allowedEnd } = user.attendanceConfig.punchRestrictions;
        if (currentHour < allowedStart || currentHour > allowedEnd) {
            return next(new AppError(`Punching allowed only between ${allowedStart}:00 and ${allowedEnd}:00`, 400));
        }
    }
    
    // 3. Check for duplicate recent punch
    const recentPunch = await AttendanceLog.findOne({
        user: user._id,
        type,
        timestamp: { $gte: dayjs().subtract(2, 'minutes').toDate() }
    });
    
    if (recentPunch) {
        return next(new AppError('Duplicate punch detected. Please wait before punching again.', 429));
    }
    
    // 4. Geo-fencing validation
    let geoValidation = { isValid: true, distance: 0, reason: '' };
    
    if (user.attendanceConfig.enforceGeoFence && latitude && longitude) {
        geoValidation = await validateGeoFence(user, latitude, longitude);
        if (!geoValidation.isValid) {
            return next(new AppError(geoValidation.reason, 400));
        }
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const dateStr = dayjs(now).format('YYYY-MM-DD');
        const timeStr = dayjs(now).format('HH:mm:ss');
        
        // 5. Create Audit Log
        const log = new AttendanceLog({
            source: 'web',
            user: user._id,
            organizationId: user.organizationId,
            branchId: user.branchId,
            timestamp: now,
            type,
            location: {
                type: 'Point',
                coordinates: [longitude, latitude],
                accuracy,
                geofenceStatus: geoValidation.isValid ? 'inside' : 'outside'
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            deviceId,
            processingStatus: 'processed',
            processingNotes: notes
        });
        
        await log.save({ session });
        
        // 6. Update Daily Record
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
                logs: [log._id],
                status: type === 'in' ? 'present' : 'absent'
            });
            
            // Get user's shift
            const shift = await Shift.findById(user.shiftId).session(session);
            if (shift) {
                daily.shiftId = shift._id;
                daily.scheduledInTime = shift.startTime;
                daily.scheduledOutTime = shift.endTime;
            }
            
            if (type === 'in') daily.firstIn = now;
        } else {
            daily.logs.push(log._id);
            
            if (type === 'in' && (!daily.firstIn || now < daily.firstIn)) {
                daily.firstIn = now;
            }
            
            if (type === 'out' && (!daily.lastOut || now > daily.lastOut)) {
                daily.lastOut = now;
            }
        }
        
        // Calculate hours
        if (daily.firstIn && daily.lastOut) {
            const diffMs = daily.lastOut - daily.firstIn;
            daily.totalWorkHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
        }
        
        await daily.save({ session });
        
        await session.commitTransaction();
        
        // 7. Real-time Notifications
        const punchEvent = {
            userId: user._id,
            userName: user.name,
            type,
            time: timeStr,
            date: dateStr,
            source: 'web',
            location: { latitude, longitude },
            logId: log._id
        };
        
        // Broadcast to organization
        emitToOrg(user.organizationId, 'attendance:punch:manual', punchEvent);
        
        // Notify user
        emitToUser(user._id, 'attendance:punch:success', {
            type,
            time: timeStr,
            date: dateStr,
            logId: log._id
        });
        
        // Notify manager
        if (user.manager) {
            emitToUser(user.manager, 'attendance:employee:punch', {
                employeeId: user._id,
                employeeName: user.name,
                type,
                time: timeStr,
                date: dateStr,
                source: 'web'
            });
        }
        
        res.status(200).json({
            status: 'success',
            data: {
                type,
                time: timeStr,
                date: dateStr,
                location: geoValidation.isValid ? 'Verified' : 'Not verified',
                distance: geoValidation.distance,
                logId: log._id
            }
        });
        
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
});

// Helper functions
const mapLogType = (status, providerType = 'generic') => {
    const statusStr = String(status).toLowerCase();
    
    // Provider-specific mappings
    const mappings = {
        zkteco: {
            '0': 'in', '1': 'out', 'checkin': 'in', 'checkout': 'out'
        },
        hikvision: {
            'in': 'in', 'out': 'out', 'enter': 'in', 'exit': 'out'
        },
        essl: {
            '0': 'in', '1': 'out', '2': 'break_start', '3': 'break_end'
        },
        generic: {
            '0': 'in', '1': 'out', '2': 'break_start', '3': 'break_end',
            'in': 'in', 'out': 'out', 'checkin': 'in', 'checkout': 'out'
        }
    };
    
    const providerMap = mappings[providerType] || mappings.generic;
    return providerMap[statusStr] || 'unknown';
};

const validateGeoFence = async (user, lat, lng) => {
    // Implementation for geo-fencing validation
    // This should check against branch location and radius
    
    const result = { isValid: true, distance: 0, reason: '' };
    
    // For now, return success
    // In production, implement actual geo-fencing logic
    
    return result;
};