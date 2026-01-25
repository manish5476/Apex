const express = require('express');
const router = express.Router();
const auth = require('../../auth/auth.controller');
const leaveController = require('../controllers/leave.controller');

router.use(auth.protect);

// Employee routes
router.get('/my', leaveController.getMyLeaves);
router.get('/balance', leaveController.getLeaveBalance);
router.get('/calendar', leaveController.getLeaveCalendar);
router.post('/', leaveController.createLeave);
router.patch('/:id/cancel', leaveController.cancelLeave);

// Manager/Admin routes
router.use(auth.restrictTo('manager', 'admin', 'owner', 'hr'));
router.get('/', leaveController.getAllLeaves);
router.get('/pending', leaveController.getPendingLeaves);
router.patch('/:id/process', leaveController.processLeave);

module.exports = router;