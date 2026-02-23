const express = require('express');
const router = express.Router();
const holidayController = require('../../controllers/attendance/holiday.controller');
const authController = require("../../../auth/core/auth.controller");
const { checkPermission } = require("../../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../../config/permissions");
const { validateHoliday } = require('../../middleware/validators');

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. PUBLIC CALENDAR (Employee View)
// ======================================================

// Get the next few holidays for the dashboard
router.get('/upcoming', 
  checkPermission(PERMISSIONS.HOLIDAY.READ), 
  holidayController.getUpcomingHolidays
);

// Browse holidays by a specific calendar year
router.get('/year/:year', 
  checkPermission(PERMISSIONS.HOLIDAY.READ), 
  holidayController.getHolidaysByYear
);

// Check if a specific date is a holiday (useful for leave applications)
router.post('/check-date', 
  checkPermission(PERMISSIONS.HOLIDAY.READ), 
  holidayController.checkDate
);

// ======================================================
// 2. ANALYTICS & EXPORTS (HR/Management)
// ======================================================

router.get('/stats', 
  checkPermission(PERMISSIONS.HOLIDAY.READ), 
  holidayController.getHolidayStats
);

router.get('/export', 
  checkPermission(PERMISSIONS.HOLIDAY.MANAGE), 
  holidayController.exportHolidays
);

// ======================================================
// 3. ADMINISTRATIVE BULK TOOLS
// ======================================================

// Import a full list of holidays (e.g., from a CSV or Govt list)
router.post('/bulk', 
  checkPermission(PERMISSIONS.HOLIDAY.MANAGE), 
  holidayController.bulkCreateHolidays
);

// Duplicate the current year's calendar structure to the next year
router.post('/copy-year', 
  checkPermission(PERMISSIONS.HOLIDAY.MANAGE), 
  holidayController.copyHolidaysFromYear
);

// ======================================================
// 4. STANDARD CRUD
// ======================================================

router.route('/')
  .get(checkPermission(PERMISSIONS.HOLIDAY.READ), holidayController.getAllHolidays)
  .post(
    checkPermission(PERMISSIONS.HOLIDAY.MANAGE),
    validateHoliday, 
    holidayController.createHoliday
  );

router.route('/:id')
  .get(checkPermission(PERMISSIONS.HOLIDAY.READ), holidayController.getHoliday)
  .patch(
    checkPermission(PERMISSIONS.HOLIDAY.MANAGE),
    validateHoliday, 
    holidayController.updateHoliday
  )
  .delete(
    checkPermission(PERMISSIONS.HOLIDAY.MANAGE), 
    holidayController.deleteHoliday
  );

module.exports = router;