'use strict';

const express = require('express');
const router = express.Router();
const hrmsResponseFormatter = require('../middleware/responseFormatter');

// Import HRMS route modules
const departmentRoutes = require('../core-hr/routes/department.routes');
const designationRoutes = require('../core-hr/routes/designation.routes');
const employeeRoutes = require('../core-hr/routes/employee.routes');
const companyAssetRoutes = require('../core-hr/routes/companyAsset.routes');
const employeeDocumentRoutes = require('../core-hr/routes/employeeDocument.routes');
const shiftRoutes = require('../attendance/routes/shift.routes');
const shiftGroupRoutes = require('../attendance/routes/shiftGroup.routes');
const leaveRequestRoutes = require('../leave-management/routes/leaveRequest.routes');
const leaveBalanceRoutes = require('../leave-management/routes/leaveBalance.routes');
const attendanceLogRoutes = require('../attendance/routes/attendanceLog.routes');
const attendanceDailyRoutes = require('../attendance/routes/attendanceDaily.routes');
const attendanceMachineRoutes = require('../attendance/routes/attendanceMachine.routes');
const geoFenceRoutes = require('../attendance/routes/geoFence.routes');
const holidayRoutes = require('../leave-management/routes/holiday.routes');
const attendanceRequestRoutes = require('../attendance/routes/attendanceRequest.routes');
const payrollRoutes = require('../payroll-compensation/routes/payroll.routes');
const salaryStructureRoutes = require('../payroll-compensation/routes/salaryStructure.routes');
const expenseClaimRoutes = require('../payroll-compensation/routes/expenseClaim.routes');

// Health check specific to HRMS
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'HRMS API is running',
    timestamp: new Date().toISOString()
  });
});

// Apply standardized response shape to every HRMS endpoint
router.use(hrmsResponseFormatter);

// Mount all HRMS routes under /hrms
router.use('/departments', departmentRoutes);
router.use('/designations', designationRoutes);
router.use('/employees', employeeRoutes);
router.use('/assets', companyAssetRoutes);
router.use('/documents', employeeDocumentRoutes);
router.use('/shifts', shiftRoutes);
router.use('/shift-groups', shiftGroupRoutes);
router.use('/leave-requests', leaveRequestRoutes);
router.use('/leave-balances', leaveBalanceRoutes);
router.use('/attendance/logs', attendanceLogRoutes);
router.use('/attendance/daily', attendanceDailyRoutes);
router.use('/attendance/machines', attendanceMachineRoutes);
router.use('/attendance/geofences', geoFenceRoutes);
router.use('/attendance/holidays', holidayRoutes);
router.use('/attendance-requests', attendanceRequestRoutes);
router.use('/payroll', payrollRoutes);
router.use('/salary-structures', salaryStructureRoutes);
router.use('/expenses', expenseClaimRoutes);

module.exports = router;
