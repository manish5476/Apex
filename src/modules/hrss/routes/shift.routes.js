const express = require('express');
const router = express.Router();
const auth = require('../../auth/auth.controller');
const shiftController = require('../controllers/shift.controller');

router.use(auth.protect);

// All users can view shifts
router.get('/', shiftController.getAllShifts);
router.get('/rotation', shiftController.getShiftRotation);
router.get('/compliance', shiftController.checkShiftCompliance);
router.get('/:id', shiftController.getShiftById);

// Admin/Manager routes
router.use(auth.restrictTo('admin', 'owner', 'hr', 'manager'));
router.post('/', shiftController.createShift);
router.post('/:id/assign', shiftController.assignShiftToUsers);
router.patch('/:id', shiftController.updateShift);
router.patch('/:id/set-default', shiftController.setDefaultShift);
router.delete('/:id', shiftController.deleteShift);

module.exports = router;