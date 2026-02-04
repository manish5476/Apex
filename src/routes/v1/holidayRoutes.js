const express = require('express');
const holidayController = require('../../modules/hr/holiday/holiday.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission, } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

// 🔒 All routes require login
router.use(authController.protect);

// Replace authController.restrictTo with checkPermission:
router.route('/')
  .get(checkPermission(PERMISSIONS.HOLIDAY.READ), holidayController.getHolidays)
  .post(checkPermission(PERMISSIONS.HOLIDAY.MANAGE), holidayController.createHoliday);

// 🟢 New Perfection Route
router.post('/bulk-import',
  checkPermission(PERMISSIONS.HOLIDAY.MANAGE),
  holidayController.bulkCreateHolidays
);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.HOLIDAY.READ), holidayController.getHolidayById)
  .patch(checkPermission(PERMISSIONS.HOLIDAY.MANAGE), holidayController.updateHoliday)
  .delete(checkPermission(PERMISSIONS.HOLIDAY.MANAGE), holidayController.deleteHoliday);
module.exports = router;
