const express = require('express');
const holidayController = require('../../controllers/holidayController');
const authController = require('../../controllers/authController');
const { checkPermission, } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

// 🔒 All routes require login
router.use(authController.protect);

// Replace authController.restrictTo with checkPermission:
router.route('/')
  .get(checkPermission(PERMISSIONS.HOLIDAY.READ), holidayController.getHolidays)
  .post(checkPermission(PERMISSIONS.HOLIDAY.MANAGE), holidayController.createHoliday);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.HOLIDAY.READ), holidayController.getHolidayById)
  .patch(checkPermission(PERMISSIONS.HOLIDAY.MANAGE), holidayController.updateHoliday)
  .delete(checkPermission(PERMISSIONS.HOLIDAY.MANAGE), holidayController.deleteHoliday);
module.exports = router;
