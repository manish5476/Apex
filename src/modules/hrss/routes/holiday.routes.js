const express = require('express');
const router = express.Router();
const auth = require('../../auth/auth.controller');
const holidayController = require('../controllers/holiday.controller');

router.use(auth.protect);

// All users can view holidays
router.get('/', holidayController.getHolidays);
router.get('/calendar', holidayController.getHolidayCalendar);
router.get('/check', holidayController.checkDate);
router.get('/:id', holidayController.getHolidayById);

// Admin only routes
router.use(auth.restrictTo('admin', 'owner', 'hr'));
router.post('/', holidayController.createHoliday);
router.post('/bulk-import', holidayController.bulkImportHolidays);
router.patch('/:id', holidayController.updateHoliday);
router.delete('/:id', holidayController.deleteHoliday);

module.exports = router;