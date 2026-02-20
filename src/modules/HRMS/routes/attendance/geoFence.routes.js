// routes/attendance/geoFence.routes.js
const express = require('express');
const router = express.Router();
const geoFenceController = require('../../controllers/attendance/geoFence.controller');
const { restrictTo } = require('../../middleware/auth');
const { validateGeoFence } = require('../../middleware/validators');
const authController = require("../../../auth/core/auth.controller");

router.use(authController.protect);
// Geolocation operations
router.post('/nearby', geoFenceController.findNearby);
router.get('/violations', geoFenceController.getViolations);
// Geofence operations
router.post('/:id/check-point', geoFenceController.checkPoint);
router.get('/:id/stats', geoFenceController.getGeofenceStats);
// Assignment routes
router.post('/:id/assign-users', geoFenceController.assignToUsers);
router.post('/:id/assign-departments', geoFenceController.assignToDepartments);

// Standard CRUD
router.route('/')
  .get(geoFenceController.getAllGeoFences)
  .post(

    validateGeoFence,
    geoFenceController.createGeoFence
  );

router.route('/:id')
  .get(geoFenceController.getGeoFence)
  .patch(

    validateGeoFence,
    geoFenceController.updateGeoFence
  )
  .delete(geoFenceController.deleteGeoFence);

module.exports = router;