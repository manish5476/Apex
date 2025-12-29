const express = require('express');
const attendanceController = require('../../controllers/attendanceController');
const authController = require('../../controllers/authController'); // If you need admin mgmt later

const router = express.Router();

// 🟢 PUBLIC ENDPOINT (Protected by API Key inside Controller)
// This is where the machine POSTs data
router.post('/machine-push', attendanceController.pushMachineData);

// 🔒 PROTECTED ROUTES (For Admin/HR to view)
// You can add GET routes here later for reports
// router.use(authController.protect);
// router.get('/daily-report', attendanceController.getDailyReport);

module.exports = router;
