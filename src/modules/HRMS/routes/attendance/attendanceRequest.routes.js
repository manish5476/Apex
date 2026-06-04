// routes/attendance/attendanceRequest.routes.js
const express = require('express');
const attendanceRequestController = require('../../controllers/attendance/attendanceRequest.controller');
const { protect, restrictTo } = require('../../../auth/core/auth.controller');

const router = express.Router();

router.use(protect);

// Employee routes
router.get('/my-requests', attendanceRequestController.getMyRequests);
router.post('/', attendanceRequestController.createRequest);
router.patch('/:id/cancel', attendanceRequestController.cancelRequest);

// Manager/Approver routes
router.get('/pending-approvals', attendanceRequestController.getPendingApprovals);
router.patch('/:id/approve', attendanceRequestController.approveRequest);
router.patch('/:id/reject', attendanceRequestController.rejectRequest);

// Get single request (for detail view)
router.get('/:id', attendanceRequestController.getRequest);

// Admin-only route to view all requests
router.use(restrictTo('Super Admin', 'Organization Admin', 'HR Manager'));
router.get('/', attendanceRequestController.getAllRequests);

module.exports = router;
