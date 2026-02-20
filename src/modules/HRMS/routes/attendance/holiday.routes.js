// routes/attendance/holiday.routes.js
const express = require('express');
const router = express.Router();
const holidayController = require('../../controllers/attendance/holiday.controller');
const { protect, restrictTo } = require('../../middleware/auth');
const { validateHoliday } = require('../../middleware/validators');
const authController = require("../../../auth/core/auth.controller");

router.use(authController.protect);

// Public routes (within org)
router.get('/upcoming', holidayController.getUpcomingHolidays);
router.post('/check-date', holidayController.checkDate);
router.get('/export', holidayController.exportHolidays);
router.get('/stats', holidayController.getHolidayStats);

// Year-based routes
router.get('/year/:year', holidayController.getHolidaysByYear);

// Admin/HR routes
router.post('/bulk', holidayController.bulkCreateHolidays);
router.post('/copy-year', holidayController.copyHolidaysFromYear);

// Standard CRUD
router.route('/')
  .get(holidayController.getAllHolidays)
  .post(

    validateHoliday,
    holidayController.createHoliday
  );

router.route('/:id')
  .get(holidayController.getHoliday)
  .patch(

    validateHoliday,
    holidayController.updateHoliday
  )
  .delete(holidayController.deleteHoliday);

module.exports = router;