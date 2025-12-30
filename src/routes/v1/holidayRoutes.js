const express = require('express');
const holidayController = require('../../controllers/holidayController');
const authController = require('../../controllers/authController');

const router = express.Router();

// 🔒 All routes require login
router.use(authController.protect);

router.route('/')
    .get(holidayController.getHolidays) // Employees need to see holidays
    .post(
        // authController.restrictTo('admin', 'superadmin', 'manager'), 
        holidayController.createHoliday
    );

router.route('/:id')
    .get(holidayController.getHolidayById)
    .patch(
        // authController.restrictTo('admin', 'superadmin', 'manager'), 
        holidayController.updateHoliday
    )
    .delete(
        // authController.restrictTo('admin', 'superadmin'), 
        holidayController.deleteHoliday
    );

module.exports = router;

// const express = require('express');
// const holidayController = require('../../controllers/holidayController');
// const authController = require('../../controllers/authController');

// const router = express.Router();

// // Protect all routes
// router.use(authController.protect);

// router.route('/')
//     .get(holidayController.getHolidays)
//     .post(
        // authController.restrictTo('admin', 'superadmin', 'manager'), 
//         holidayController.createHoliday
//     );

// router.route('/:id')
//     // .patch(holidayController.updateHoliday) // Add if you implement update
//     .delete(
//         authController.restrictTo('admin', 'superadmin'), 
//         holidayController.deleteHoliday
//     );

// module.exports = router;