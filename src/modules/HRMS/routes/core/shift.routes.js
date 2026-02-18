// routes/core/shift.routes.js
const express = require('express');
const router = express.Router();
const shiftController = require('../../controllers/core/shift.controller');
const { protect, restrictTo } = require('../../middleware/auth');
const { validateShift } = require('../../middleware/validators');

router.use(protect);

// Special routes
router.post('/calculate-hours', shiftController.calculateShiftHours);
router.get('/coverage', restrictTo('admin', 'hr', 'manager'), shiftController.getShiftCoverage);
router.get('/timeline', shiftController.getShiftTimeline);
router.post('/validate-assignment', shiftController.validateShiftAssignment);

// Clone shift
router.post('/:id/clone', restrictTo('admin'), shiftController.cloneShift);

// Standard CRUD
router.route('/')
  .get(shiftController.getAllShifts)
  .post(
    restrictTo('admin', 'hr'),
    validateShift,
    shiftController.createShift
  );

router.route('/:id')
  .get(shiftController.getShift)
  .patch(
    restrictTo('admin', 'hr'),
    validateShift,
    shiftController.updateShift
  )
  .delete(restrictTo('admin'), shiftController.deleteShift);

// Shift assignments
router.get('/:id/assignments', shiftController.getShiftAssignments);

module.exports = router;