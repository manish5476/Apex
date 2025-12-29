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
