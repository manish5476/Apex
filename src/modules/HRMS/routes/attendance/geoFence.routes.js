const express = require('express');
const router = express.Router();
const geoFenceController = require('../../controllers/attendance/geoFence.controller');
const authController = require("../../../auth/core/auth.controller");
const { checkPermission } = require("../../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../../config/permissions");
const { validateGeoFence } = require('../../middleware/validators');

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. LOCATION VERIFICATION (User & System)
// ======================================================

// Check if current user is within any assigned geofence
router.post('/nearby', 
  geoFenceController.findNearby
);

// Verify specific point against a specific geofence
router.post('/:id/check-point', 
  geoFenceController.checkPoint
);

// ======================================================
// 2. MONITORING & VIOLATIONS (HR/Admin)
// ======================================================

// List all instances of users clocking in outside assigned zones
router.get('/violations', 
  checkPermission(PERMISSIONS.ATTENDANCE.GEOFENCE_READ), 
  geoFenceController.getViolations
);

// Performance and usage stats for a specific zone
router.get('/:id/stats', 
  checkPermission(PERMISSIONS.ATTENDANCE.GEOFENCE_READ), 
  geoFenceController.getGeofenceStats
);

// ======================================================
// 3. ASSIGNMENT & CONFIGURATION
// ======================================================

router.post('/:id/assign-users', 
  checkPermission(PERMISSIONS.ATTENDANCE.GEOFENCE_MANAGE), 
  geoFenceController.assignToUsers
);

router.post('/:id/assign-departments', 
  checkPermission(PERMISSIONS.ATTENDANCE.GEOFENCE_MANAGE), 
  geoFenceController.assignToDepartments
);

// ======================================================
// 4. STANDARD CRUD
// ======================================================

router.route('/')
  .get(checkPermission(PERMISSIONS.ATTENDANCE.GEOFENCE_READ), geoFenceController.getAllGeoFences)
  .post(
    checkPermission(PERMISSIONS.ATTENDANCE.GEOFENCE_MANAGE),
    validateGeoFence, 
    geoFenceController.createGeoFence
  );

router.route('/:id')
  .get(checkPermission(PERMISSIONS.ATTENDANCE.GEOFENCE_READ), geoFenceController.getGeoFence)
  .patch(
    checkPermission(PERMISSIONS.ATTENDANCE.GEOFENCE_MANAGE),
    validateGeoFence, 
    geoFenceController.updateGeoFence
  )
  .delete(
    checkPermission(PERMISSIONS.ATTENDANCE.GEOFENCE_MANAGE), 
    geoFenceController.deleteGeoFence
  );

module.exports = router;