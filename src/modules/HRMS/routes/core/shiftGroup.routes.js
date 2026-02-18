// routes/core/shiftGroup.routes.js
const express = require('express');
const router = express.Router();
const shiftGroupController = require('../../controllers/core/shiftGroup.controller');
const { protect, restrictTo } = require('../../middleware/auth');
const { validateShiftGroup } = require('../../middleware/validators');

router.use(protect);

// Special routes
router.post('/:id/generate-schedule', restrictTo('admin', 'hr'), shiftGroupController.generateRotationSchedule);
router.post('/:id/assign', restrictTo('admin', 'hr'), shiftGroupController.assignGroupToUsers);
router.get('/:id/assignments', shiftGroupController.getGroupAssignments);

// Standard CRUD
router.route('/')
  .get(shiftGroupController.getAllShiftGroups)
  .post(
    restrictTo('admin', 'hr'),
    validateShiftGroup,
    shiftGroupController.createShiftGroup
  );

router.route('/:id')
  .get(shiftGroupController.getShiftGroup)
  .patch(
    restrictTo('admin', 'hr'),
    validateShiftGroup,
    shiftGroupController.updateShiftGroup
  )
  .delete(restrictTo('admin'), shiftGroupController.deleteShiftGroup);

module.exports = router;