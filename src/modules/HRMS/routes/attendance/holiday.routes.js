// routes/attendance/holiday.routes.js
const express = require('express');
const router = express.Router();
const holidayController = require('../../controllers/attendance/holiday.controller');
const { protect, restrictTo } = require('../../middleware/auth');
const { validateHoliday } = require('../../middleware/validators');

router.use(protect);

// Public routes (within org)
router.get('/upcoming', holidayController.getUpcomingHolidays);
router.post('/check-date', holidayController.checkDate);
router.get('/export', holidayController.exportHolidays);
router.get('/stats', restrictTo('admin', 'hr'), holidayController.getHolidayStats);

// Year-based routes
router.get('/year/:year', holidayController.getHolidaysByYear);

// Admin/HR routes
router.post('/bulk', restrictTo('admin', 'hr'), holidayController.bulkCreateHolidays);
router.post('/copy-year', restrictTo('admin', 'hr'), holidayController.copyHolidaysFromYear);

// Standard CRUD
router.route('/')
  .get(holidayController.getAllHolidays)
  .post(
    restrictTo('admin', 'hr'),
    validateHoliday,
    holidayController.createHoliday
  );

router.route('/:id')
  .get(holidayController.getHoliday)
  .patch(
    restrictTo('admin', 'hr'),
    validateHoliday,
    holidayController.updateHoliday
  )
  .delete(restrictTo('admin', 'hr'), holidayController.deleteHoliday);

module.exports = router;