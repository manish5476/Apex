// routes/attendance/geoFence.routes.js
const express = require('express');
const router = express.Router();
const geoFenceController = require('../../controllers/attendance/geoFence.controller');
const { protect, restrictTo } = require('../../middleware/auth');
const { validateGeoFence } = require('../../middleware/validators');

router.use(protect);

// Geolocation operations
router.post('/nearby', geoFenceController.findNearby);
router.get('/violations', restrictTo('admin', 'hr'), geoFenceController.getViolations);

// Geofence operations
router.post('/:id/check-point', geoFenceController.checkPoint);
router.get('/:id/stats', restrictTo('admin', 'hr'), geoFenceController.getGeofenceStats);

// Assignment routes
router.post('/:id/assign-users', restrictTo('admin'), geoFenceController.assignToUsers);
router.post('/:id/assign-departments', restrictTo('admin'), geoFenceController.assignToDepartments);

// Standard CRUD
router.route('/')
  .get(geoFenceController.getAllGeoFences)
  .post(
    restrictTo('admin'),
    validateGeoFence,
    geoFenceController.createGeoFence
  );

router.route('/:id')
  .get(geoFenceController.getGeoFence)
  .patch(
    restrictTo('admin'),
    validateGeoFence,
    geoFenceController.updateGeoFence
  )
  .delete(restrictTo('admin'), geoFenceController.deleteGeoFence);

module.exports = router;