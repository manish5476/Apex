const express = require("express");
const router = express.Router();
const shiftController = require("../controllers/shift.controller");
const authController = require("../../auth/core/auth.controller");

// Protect all routes
router.use(authController.protect);

router.route("/")
  .get(shiftController.getAllShifts)
  .post(
    authController.restrictTo('superadmin', 'admin', 'hr'),
    shiftController.createShift
  );

router.route("/:id")
  .get(shiftController.getShift)
  .patch(
    authController.restrictTo('superadmin', 'admin', 'hr'),
    shiftController.updateShift
  )
  .delete(
    authController.restrictTo('superadmin', 'admin', 'hr'),
    shiftController.deleteShift
  );

module.exports = router;