const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const service = require('../services/workAssignment.service');
const {
  createWorkAssignmentSchema,
  updateWorkAssignmentSchema,
  updateStatusSchema,
  completeWorkAssignmentSchema,
} = require('../validation/workAssignment.validation');
const { emitToOrg, emitToUsers } = require('../../../socketHandlers/socket');

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Emit a field-service socket event safely.
 * Guards against the socket server not being initialised yet.
 */
const emit = (orgId, event, payload) => {
  if (typeof emitToOrg === 'function') {
    emitToOrg(orgId.toString(), event, payload);
  }
};

const emitToAssignees = (assignees, event, payload) => {
  if (typeof emitToUsers === 'function' && assignees?.length) {
    emitToUsers(assignees.map(id => id.toString()), event, payload);
  }
};

// ─────────────────────────────────────────────
//  CRUD
// ─────────────────────────────────────────────

exports.createWorkAssignment = catchAsync(async (req, res) => {
  const payload = createWorkAssignmentSchema.parse(req.body);
  const result = await service.create(req.user.organizationId, payload, req.user._id);

  const orgId = req.user.organizationId;

  if (result.seriesId) {
    // Recurring: result = { seriesId, count, first }
    emit(orgId, 'field-service:assignment.created', {
      type: 'series',
      seriesId: result.seriesId,
      count:    result.count,
      first:    result.first,
    });
    return res.status(201).json({
      status: 'success',
      data: { seriesId: result.seriesId, count: result.count, first: result.first },
    });
  }

  // Single assignment
  emit(orgId, 'field-service:assignment.created', { type: 'single', assignment: result });
  emitToAssignees(result.assignedTo, 'field-service:assignment.assigned', { assignment: result });

  return res.status(201).json({ status: 'success', data: { assignment: result } });
});

exports.getAllWorkAssignments = catchAsync(async (req, res) => {
  const result = await service.getList(req.user.organizationId, req.query);
  return res.status(200).json({
    status: 'success',
    data: result.data,
    pagination: result.pagination,
  });
});

exports.getWorkAssignment = catchAsync(async (req, res, next) => {
  const assignment = await service.getById(req.user.organizationId, req.params.id);
  if (!assignment) return next(new AppError('Work assignment not found', 404));
  return res.status(200).json({ status: 'success', data: { assignment } });
});

exports.updateWorkAssignment = catchAsync(async (req, res) => {
  const { scope, ...rest } = updateWorkAssignmentSchema.parse(req.body);
  const assignment = await service.update(req.user.organizationId, req.params.id, rest, req.user._id, scope);

  emit(req.user.organizationId, 'field-service:assignment.updated', { assignment });
  emitToAssignees(assignment.assignedTo, 'field-service:assignment.updated', { assignment });

  return res.status(200).json({ status: 'success', data: { assignment } });
});

exports.updateStatus = catchAsync(async (req, res) => {
  const { status } = updateStatusSchema.parse(req.body);
  const assignment = await service.updateStatus(
    req.user.organizationId, req.params.id, status, req.user._id
  );

  const orgId = req.user.organizationId;
  emit(orgId, 'field-service:assignment.updated', { assignment });
  emitToAssignees(assignment.assignedTo, 'field-service:assignment.status_changed', {
    id: assignment._id,
    status: assignment.status,
  });

  // Emit SLA breach if it just got detected
  if (assignment.sla?.breached) {
    emit(orgId, 'field-service:assignment.sla_breach', {
      id:           assignment._id,
      title:        assignment.title,
      slaDeadline:  assignment.sla.completionDeadline,
      breachType:   assignment.sla.breachType,
    });
  }

  return res.status(200).json({ status: 'success', data: { assignment } });
});

exports.completeWorkAssignment = catchAsync(async (req, res) => {
  const completionData = completeWorkAssignmentSchema.parse(req.body);
  const assignment = await service.complete(
    req.user.organizationId, req.params.id, req.user._id, completionData
  );

  const orgId = req.user.organizationId;
  emit(orgId, 'field-service:assignment.completed', { assignment });

  return res.status(200).json({ status: 'success', data: { assignment } });
});

// ─────────────────────────────────────────────
//  Series
// ─────────────────────────────────────────────

exports.getSeries = catchAsync(async (req, res) => {
  const assignments = await service.getSeries(req.user.organizationId, req.params.seriesId);
  return res.status(200).json({ status: 'success', results: assignments.length, data: { assignments } });
});

// ─────────────────────────────────────────────
//  Calendar
// ─────────────────────────────────────────────

exports.getCalendarRange = catchAsync(async (req, res) => {
  const { startDate, endDate, assignedTo, priority } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      status: 'fail',
      message: 'startDate and endDate query params are required',
    });
  }

  const filters = {};
  if (assignedTo) filters.assignedTo = assignedTo;
  if (priority)   filters.priority = priority;

  const assignments = await service.getCalendarRange(
    req.user.organizationId, startDate, endDate, filters
  );

  return res.status(200).json({
    status: 'success',
    results: assignments.length,
    data: { assignments },
  });
});

// ─────────────────────────────────────────────
//  Analytics & SLA
// ─────────────────────────────────────────────

exports.getStats = catchAsync(async (req, res) => {
  const stats = await service.getStats(req.user.organizationId);
  return res.status(200).json({ status: 'success', data: { stats } });
});

exports.getSlaAtRisk = catchAsync(async (req, res) => {
  const assignments = await service.getSlaAtRisk(req.user.organizationId);
  return res.status(200).json({
    status: 'success',
    results: assignments.length,
    data: { assignments },
  });
});
