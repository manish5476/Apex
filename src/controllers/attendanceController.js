const mongoose = require('mongoose');
const AttendanceMachine = require('../models/attendanceMachineModel');
const AttendanceLog = require('../models/attendanceLogModel');
const AttendanceDaily = require('../models/attendanceDailyModel');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const dayjs = require('dayjs'); // You might need to install: npm install dayjs

/**
 * @desc   Receive data from Biometric Machines
 * @route  POST /api/v1/attendance/machine-push
 */
exports.pushMachineData = catchAsync(async (req, res, next) => {
    const apiKey = req.headers['x-machine-api-key'];
    
    // 1. Authenticate Machine
    const machine = await AttendanceMachine.findOne({ apiKey }).select('+apiKey');
    if (!machine || machine.status !== 'active') {
        return next(new AppError('Unauthorized Machine', 401));
    }

    const payload = Array.isArray(req.body) ? req.body : [req.body];
    if (payload.length === 0) return res.status(200).json({ message: 'No data' });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const processedLogs = [];

        for (const entry of payload) {
            // Adapt these fields based on your specific machine's JSON format
            const machineUserId = entry.userId || entry.user_id; 
            const scanTime = new Date(entry.timestamp); 
            const statusType = entry.status; // 0=CheckIn, 1=CheckOut usually

            // A. Find User
            const user = await User.findOne({ 
                'attendanceConfig.machineUserId': machineUserId,
                organizationId: machine.organizationId
            }).session(session);

            let processingStatus = 'processed';
            let resolvedUserId = user ? user._id : null;

            if (!user) processingStatus = 'orphan';

            // B. Create Immutable Log
            const logEntry = new AttendanceLog({
                machineId: machine._id,
                rawUserId: machineUserId,
                user: resolvedUserId,
                timestamp: scanTime,
                type: mapLogType(statusType),
                metadata: entry,
                processingStatus
            });
            await logEntry.save({ session });
            
            // C. Update Daily Record (Only if User is identified)
            if (user) {
                const dateStr = dayjs(scanTime).format('YYYY-MM-DD');
                
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
                        firstIn: scanTime,
                        logs: [logEntry._id],
                        status: 'present'
                    });
                } else {
                    // Update First In / Last Out logic
                    if (scanTime < daily.firstIn) daily.firstIn = scanTime;
                    if (!daily.lastOut || scanTime > daily.lastOut) daily.lastOut = scanTime;
                    daily.logs.push(logEntry._id);
                }

                // Simple Hours Calculation
                if (daily.firstIn && daily.lastOut) {
                    const diff = daily.lastOut - daily.firstIn;
                    daily.totalWorkHours = (diff / (1000 * 60 * 60)).toFixed(2);
                }

                await daily.save({ session });
            }
            
            processedLogs.push(logEntry._id);
        }
        
        // Update Machine Last Sync
        machine.lastSyncAt = new Date();
        await machine.save({ session });

        await session.commitTransaction();
        res.status(200).json({ status: 'success', synced: processedLogs.length });

    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
});

// Helper: Map manufacturer status codes to our system
const mapLogType = (status) => {
    // Customize this map based on your specific hardware documentation
    // Common ZKTeco/Hikvision codes:
    if (String(status) === '0' || String(status) === 'CheckIn') return 'in';
    if (String(status) === '1' || String(status) === 'CheckOut') return 'out';
    return 'unknown';
};
