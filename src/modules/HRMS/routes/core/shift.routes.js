// routes/core/shift.routes.js
const express = require('express');
const router = express.Router();
const shiftController = require('../../controllers/core/shift.controller');
const { validateShift } = require('../../middleware/validators');
const authController = require("../../../auth/core/auth.controller");

// All routes require authentication
router.use(authController.protect);

// Special routes
router.post('/calculate-hours', shiftController.calculateShiftHours);
router.get('/coverage', shiftController.getShiftCoverage);
router.get('/timeline', shiftController.getShiftTimeline);
router.post('/validate-assignment', shiftController.validateShiftAssignment);

// Clone shift
router.post('/:id/clone', shiftController.cloneShift);

// Standard CRUD
router.route('/')
  .get(shiftController.getAllShifts)
  .post(
    validateShift,
    shiftController.createShift
  );

router.route('/:id')
  .get(shiftController.getShift)
  .patch(
    validateShift,
    shiftController.updateShift
  )
  .delete( shiftController.deleteShift);

// Shift assignments
router.get('/:id/assignments', shiftController.getShiftAssignments);

module.exports = router;