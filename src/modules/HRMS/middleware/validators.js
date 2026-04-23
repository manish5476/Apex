// middleware/validators.js
const { body, param, query, validationResult } = require('express-validator');
const AppError = require('../../../core/utils/api/appError');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg);
    return next(new AppError(errorMessages.join('. '), 400));
  }
  next();
};

// Department validation
exports.validateDepartment = [
  body('name')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Department name is required'),
  body('code')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Department code is required'),
  body('name').optional().trim().notEmpty().withMessage('Department name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Department code cannot be empty'),
  body('parentDepartment').optional().isMongoId().withMessage('Invalid parent department ID'),
  body('headOfDepartment').optional().isMongoId().withMessage('Invalid HOD user ID'),
  validate
];

// Designation validation
exports.validateDesignation = [
  body('title')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Designation title is required'),
  body('code')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Designation code is required'),
  body('level')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Designation level is required'),
  body('grade')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Designation grade is required'),
  body('title').optional().trim().notEmpty().withMessage('Designation title cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Designation code cannot be empty'),
  body('level').optional().isInt({ min: 1 }).withMessage('Level must be a positive integer'),
  body('grade').optional().isIn(['A', 'B', 'C', 'D', 'E', 'F']).withMessage('Invalid grade'),
  validate
];

// Shift validation
exports.validateShift = [
  body('name')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Shift name is required'),
  body('code')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Shift code is required'),
  body('startTime')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Shift startTime is required'),
  body('endTime')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Shift endTime is required'),
  body('name').optional().trim().notEmpty().withMessage('Shift name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Shift code cannot be empty'),
  body('startTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid start time format (HH:MM)'),
  body('endTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid end time format (HH:MM)'),
  validate
];

// ShiftGroup validation
exports.validateShiftGroup = [
  body('name')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Shift group name is required'),
  body('code')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Shift group code is required'),
  body('shifts')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Shifts are required'),
  body('name').optional().trim().notEmpty().withMessage('Shift group name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Shift group code cannot be empty'),
  body('shifts').optional().isArray().withMessage('Shifts must be an array'),
  validate
];

// LeaveRequest validation
exports.validateLeaveRequest = [
  body('leaveType')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Leave type is required'),
  body('startDate')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Start date is required'),
  body('endDate')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('End date is required'),
  body('daysCount')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Days count is required'),
  body('reason')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Reason is required'),
  body('leaveType').optional().isIn(['casual', 'sick', 'earned', 'compensatory', 'paid', 'unpaid', 'marriage', 'paternity', 'maternity', 'bereavement', 'study', 'sabbatical']).withMessage('Invalid leave type'),
  body('startDate').optional().isISO8601().withMessage('Invalid start date'),
  body('endDate').optional().isISO8601().withMessage('Invalid end date'),
  body('daysCount').optional().isFloat({ min: 0.5 }).withMessage('Days count must be at least 0.5'),
  body('reason').optional().trim().notEmpty().withMessage('Reason cannot be empty'),
  body('endDate').custom((endDate, { req }) => {
    if (!req.body.startDate || !endDate) return true;
    return new Date(endDate) >= new Date(req.body.startDate);
  }).withMessage('End date must be greater than or equal to start date'),
  validate
];

// AttendanceLog validation
exports.validateAttendanceLog = [
  body('type').isIn(['in', 'out', 'break_start', 'break_end', 'remote_in', 'remote_out']).withMessage('Invalid log type'),
  body('timestamp').optional().isISO8601().withMessage('Invalid timestamp'),
  body('location.coordinates').optional().isArray({ min: 2, max: 2 }).withMessage('Location coordinates must be [longitude, latitude]'),
  body('location.geoJson.coordinates').optional().isArray({ min: 2, max: 2 }).withMessage('GeoJSON coordinates must be [longitude, latitude]'),
  validate
];

// Machine validation
exports.validateMachine = [
  body('name')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Machine name is required'),
  body('serialNumber')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Serial number is required'),
  body('branchId')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Branch ID is required'),
  body('name').optional().trim().notEmpty().withMessage('Machine name cannot be empty'),
  body('serialNumber').optional().trim().notEmpty().withMessage('Serial number cannot be empty'),
  body('branchId').optional().isMongoId().withMessage('Invalid branch ID'),
  body('providerType').optional().isIn(['generic', 'zkteco', 'hikvision', 'essl', 'bioenable', 'suprema']).withMessage('Invalid provider type'),
  validate
];

// GeoFence validation
exports.validateGeoFence = [
  body('name')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('GeoFence name is required'),
  body('code')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('GeoFence code is required'),
  body('type')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('GeoFence type is required'),
  body('name').optional().trim().notEmpty().withMessage('GeoFence name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('GeoFence code cannot be empty'),
  body('type').optional().isIn(['circle', 'polygon', 'building', 'custom']).withMessage('Invalid geofence type'),
  validate
];

// Holiday validation
exports.validateHoliday = [
  body('name')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Holiday name is required'),
  body('date')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Holiday date is required'),
  body('holidayType')
    .if((_, { req }) => req.method === 'POST')
    .exists({ checkFalsy: true }).withMessage('Holiday type is required'),
  body('name').optional().trim().notEmpty().withMessage('Holiday name cannot be empty'),
  body('date').optional().isISO8601().withMessage('Invalid date'),
  body('holidayType').optional().isIn(['national', 'state', 'festival', 'company', 'restricted']).withMessage('Invalid holiday type'),
  validate
];
