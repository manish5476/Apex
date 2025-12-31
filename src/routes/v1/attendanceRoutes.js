const express = require('express');
const attendanceController = require('../../controllers/attendanceController'); // Machine Ingestion
const attendanceWebController = require('../../controllers/attendanceWebController'); // Web Punch
const attendanceActionsController = require('../../controllers/attendanceActionsController'); // Management
const authController = require('../../controllers/authController');
const router = express.Router();
// --- MACHINE (Public/API Key) ---
router.post('/machine-push', attendanceController.pushMachineData);
// --- PROTECTED ROUTES ---
router.use(authController.protect);
// 1. PUNCHING
router.post('/punch', attendanceWebController.markAttendance);

// 2. VIEWING & HISTORY
router.get('/my-history', attendanceActionsController.getMyAttendance);

// 3. REGULARIZATION (Employee)
router.post('/regularize', attendanceActionsController.submitRegularization);

// 4. MANAGEMENT (Admin/Manager)
router.get('/requests/pending', 
    authController.restrictTo('admin', 'manager', 'superadmin'), 
    attendanceActionsController.getPendingRequests
);

router.patch('/regularize/:id', 
    authController.restrictTo('admin', 'manager', 'superadmin'), 
    attendanceActionsController.decideRegularization
);

module.exports = router;



// const express = require('express');
// const attendanceController = require('../../controllers/attendanceController'); // Machine
// const attendanceWebController = require('../../controllers/attendanceWebController'); // New UI
// const authController = require('../../controllers/authController');

// const router = express.Router();

// // --- 1. Machine Endpoints (API Key Protected) ---
// router.post('/machine-push', attendanceController.pushMachineData);

// // --- 2. UI/Web Endpoints (User JWT Protected) ---
// router.use(authController.protect); // All routes below require login

// // The "Punch" Button
// router.post('/punch', attendanceWebController.markAttendance);

// // View My Attendance
// // router.get('/my-logs', attendanceWebController.getMyLogs);

// module.exports = router;
// // const express = require('express');
// // const attendanceController = require('../../controllers/attendanceController');
// // const authController = require('../../controllers/authController'); // If you need admin mgmt later

// // const router = express.Router();

// // // 🟢 PUBLIC ENDPOINT (Protected by API Key inside Controller)
// // // This is where the machine POSTs data
// // router.post('/machine-push', attendanceController.pushMachineData);

// // // 🔒 PROTECTED ROUTES (For Admin/HR to view)
// // // You can add GET routes here later for reports
// // // router.use(authController.protect);
// // // router.get('/daily-report', attendanceController.getDailyReport);

// // module.exports = router;
