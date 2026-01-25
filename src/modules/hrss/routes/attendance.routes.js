const express = require('express');
const router = express.Router();
const auth = require('../../auth/auth.controller');
const attendanceController = require('../controllers/attendance/attendance.controller');
const machineController = require('../controllers/attendance/machine.controller');
const requestController = require('../controllers/attendance/request.controller');

// Employee routes
router.use(auth.protect);

router.get('/my-history', attendanceController.getMyAttendance);
router.post('/punch', attendanceController.markAttendance);
router.post('/regularize', attendanceController.submitRegularization);
router.get('/my-requests', attendanceController.getMyRequests);

// Machine routes (no auth - uses API key)
router.post('/machine-push', machineController.pushMachineData);

// Machine management (admin only)
router.use(auth.restrictTo('admin', 'owner'));
router.post('/machines', machineController.createMachine);
router.get('/machines', machineController.getAllMachines);
router.patch('/machines/:id', machineController.updateMachine);
router.delete('/machines/:id', machineController.deleteMachine);

// Manager/Admin routes
router.use(auth.restrictTo('manager', 'admin', 'owner'));
router.get('/team', attendanceController.getTeamAttendance);
router.get('/summary', attendanceController.getAttendanceSummary);
router.get('/requests/pending', requestController.getPendingRequests);
router.patch('/regularize/:id', requestController.decideRegularization);

module.exports = router;