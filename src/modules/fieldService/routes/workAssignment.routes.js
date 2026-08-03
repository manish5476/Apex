const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/workAssignment.controller');
const authController = require('../../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../../config/permissions');

// All routes require a valid JWT
router.use(authController.protect);

// ── Analytics & SLA (before /:id to avoid param capture) ──────────────────────
router.get('/stats',        checkPermission(PERMISSIONS.FIELD_SERVICE.ADMIN),  ctrl.getStats);
router.get('/sla-at-risk',  checkPermission(PERMISSIONS.FIELD_SERVICE.ADMIN),  ctrl.getSlaAtRisk);

// ── Calendar range query ──────────────────────────────────────────────────────
// GET /api/v1/field-service/work-assignments/calendar?startDate=&endDate=
router.get('/calendar',     checkPermission(PERMISSIONS.FIELD_SERVICE.READ),   ctrl.getCalendarRange);

// ── Series ────────────────────────────────────────────────────────────────────
router.get('/series/:seriesId', checkPermission(PERMISSIONS.FIELD_SERVICE.READ), ctrl.getSeries);

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.route('/')
  .get(  checkPermission(PERMISSIONS.FIELD_SERVICE.READ),   ctrl.getAllWorkAssignments)
  .post( checkPermission(PERMISSIONS.FIELD_SERVICE.CREATE), ctrl.createWorkAssignment);

router.route('/:id')
  .get(  checkPermission(PERMISSIONS.FIELD_SERVICE.READ),   ctrl.getWorkAssignment)
  .patch(checkPermission(PERMISSIONS.FIELD_SERVICE.MANAGE), ctrl.updateWorkAssignment);

// ── Status transition ─────────────────────────────────────────────────────────
router.patch('/:id/status',   checkPermission(PERMISSIONS.FIELD_SERVICE.MANAGE), ctrl.updateStatus);

// ── Completion (separate endpoint — fills AI fields, calculates duration) ──────
router.post('/:id/complete',  checkPermission(PERMISSIONS.FIELD_SERVICE.MANAGE), ctrl.completeWorkAssignment);

module.exports = router;
