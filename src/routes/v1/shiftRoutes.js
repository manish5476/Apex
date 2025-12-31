const express = require('express');
const shiftController = require('../../controllers/shiftController');
const authController = require('../../controllers/authController');

const router = express.Router();

// 🔒 All routes require login
router.use(authController.protect);

router.route('/')
    .get(shiftController.getAllShifts) // Employees can view available shifts
    .post(
        // authController.restrictTo('admin', 'superadmin', 'manager'), 
        shiftController.createShift
    );

router.route('/:id')
    .get(shiftController.getShiftById)
    .patch(
        // authController.restrictTo('admin', 'superadmin', 'manager'), 
        shiftController.updateShift
    )
    .delete(
        // authController.restrictTo('admin', 'superadmin'), // Only Admins can delete
        shiftController.deleteShift
    );

module.exports = router;