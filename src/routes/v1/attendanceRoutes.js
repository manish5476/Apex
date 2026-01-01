const express = require('express');
const attendanceController = require('../../controllers/attendanceController'); // Machine Ingestion
const attendanceWebController = require('../../controllers/attendanceWebController'); // Web Punch
const attendanceActionsController = require('../../controllers/attendanceActionsController'); // Management
const authController = require('../../controllers/authController');
const { checkPermission, } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();
// Add checkPermission to these routes:
router.post('/punch', 
  checkPermission(PERMISSIONS.ATTENDANCE.MARK), 
  attendanceWebController.markAttendance
);

router.get('/my-history', 
  checkPermission(PERMISSIONS.ATTENDANCE.READ), 
  attendanceActionsController.getMyAttendance
);

router.post('/regularize', 
  checkPermission(PERMISSIONS.ATTENDANCE.REGULARIZE), 
  attendanceActionsController.submitRegularization
);

router.get('/requests/pending', 
  checkPermission(PERMISSIONS.ATTENDANCE.APPROVE), 
  attendanceActionsController.getPendingRequests
);

router.patch('/regularize/:id', 
  checkPermission(PERMISSIONS.ATTENDANCE.APPROVE), 
  attendanceActionsController.decideRegularization
);

// // --- MACHINE (Public/API Key) ---
// router.post('/machine-push', attendanceController.pushMachineData);
// // --- PROTECTED ROUTES ---
// router.use(authController.protect);
// // 1. PUNCHING
// router.post('/punch', attendanceWebController.markAttendance);

// // 2. VIEWING & HISTORY
// router.get('/my-history', attendanceActionsController.getMyAttendance);

// // 3. REGULARIZATION (Employee)
// router.post('/regularize', attendanceActionsController.submitRegularization);

// // 4. MANAGEMENT (Admin/Manager)
// router.get('/requests/pending', 
//     authController.restrictTo('admin', 'manager', 'superadmin'), 
//     attendanceActionsController.getPendingRequests
// );

// router.patch('/regularize/:id', 
//     authController.restrictTo('admin', 'manager', 'superadmin'), 
//     attendanceActionsController.decideRegularization
// );

module.exports = router;
