const mongoose = require('mongoose');
const repo = require('../repository/workAssignment.repository');
const AppError = require('../../../core/utils/api/appError');

// ─────────────────────────────────────────────
//  Recurrence helpers
// ─────────────────────────────────────────────

/**
 * Expand a recurrence rule into an array of scheduled dates.
 * Runs in memory — no DB calls required.
 *
 * @param {Date} startDate  - First occurrence date/time
 * @param {Object} rule     - recurrenceRule sub-document
 * @returns {Date[]}        - Array of occurrence dates (including startDate)
 */
const expandRecurrence = (startDate, rule) => {
  const dates = [];
  const { frequency, interval = 1, endDate, maxOccurrences = 52, daysOfWeek } = rule;

  let current = new Date(startDate);
  const limit = maxOccurrences || 52; // safety cap

  while (dates.length < limit) {
    if (endDate && current > new Date(endDate)) break;

    if (frequency === 'weekly' && daysOfWeek?.length) {
      // Expand each matching day in the current week
      const weekStart = new Date(current);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

      for (const day of daysOfWeek.sort()) {
        const occ = new Date(weekStart);
        occ.setDate(weekStart.getDate() + day);
        occ.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
        if (occ >= new Date(startDate) && (!endDate || occ <= new Date(endDate))) {
          dates.push(new Date(occ));
        }
        if (dates.length >= limit) break;
      }

      // Advance by interval weeks
      current.setDate(current.getDate() + 7 * interval);
      continue;
    }

    dates.push(new Date(current));

    switch (frequency) {
      case 'daily':   current.setDate(current.getDate() + interval); break;
      case 'weekly':  current.setDate(current.getDate() + 7 * interval); break;
      case 'monthly': current.setMonth(current.getMonth() + interval); break;
      case 'yearly':  current.setFullYear(current.getFullYear() + interval); break;
      default: break;
    }

    if (!frequency) break; // non-recurring — single date only
  }

  return dates;
};

// ─────────────────────────────────────────────
//  Service
// ─────────────────────────────────────────────

class WorkAssignmentService {

  /**
   * Create a single or recurring work assignment.
   * If recurrenceRule is provided, all occurrences are persisted immediately.
   * The first occurrence becomes the "parent"; siblings share seriesId.
   */
  async create(orgId, payload, actorId) {
    const { recurrenceRule, scheduledAt } = payload;

    // Build base payload
    const base = {
      ...payload,
      createdBy: actorId,
      updatedBy: actorId,
    };

    if (!recurrenceRule || !scheduledAt) {
      // Simple non-recurring assignment
      return repo.create(orgId, base);
    }

    // Recurring: generate all occurrence dates
    const dates = expandRecurrence(new Date(scheduledAt), recurrenceRule);
    if (dates.length === 0) throw new AppError('Recurrence rule produced no occurrences', 400);

    const seriesId = new mongoose.Types.ObjectId();

    const docs = dates.map((date, idx) => ({
      ...base,
      scheduledAt: date,
      seriesId,
      status: 'scheduled',
      nextOccurrence: dates[idx + 1] || null,
    }));

    // First document is the "parent" (parentAssignment = null)
    const created = await repo.createMany(orgId, docs);
    return {
      seriesId,
      count: created.length,
      first: created[0],
    };
  }

  async getList(orgId, query) {
    return repo.getList(orgId, query);
  }

  async getById(orgId, id) {
    const wa = await repo.getById(orgId, id);
    if (!wa) throw new AppError('Work assignment not found', 404);
    return wa;
  }

  async getSeries(orgId, seriesId) {
    return repo.getBySeries(orgId, seriesId);
  }

  async getCalendarRange(orgId, startDate, endDate, filters) {
    return repo.getCalendarRange(orgId, new Date(startDate), new Date(endDate), filters);
  }

  /**
   * Update a single assignment or all future occurrences in a series.
   * scope: 'single' | 'future' | 'all'
   */
  async update(orgId, id, payload, actorId, scope = 'single') {
    const existing = await this.getById(orgId, id);

    payload.updatedBy = actorId;

    if (scope === 'single' || !existing.seriesId) {
      return repo.updateById(orgId, id, payload);
    }

    if (scope === 'future') {
      return repo.updateSeries(orgId, existing.seriesId, payload, existing.scheduledAt);
    }

    // scope === 'all'
    return repo.updateSeries(orgId, existing.seriesId, payload);
  }

  /**
   * Transition status with valid guard.
   * Emits socket events after transition (caller provides emitter).
   */
  async updateStatus(orgId, id, newStatus, actorId, meta = {}) {
    const wa = await this.getById(orgId, id);

    const TERMINAL = ['completed', 'verified', 'closed', 'cancelled'];
    if (TERMINAL.includes(wa.status)) {
      throw new AppError(`Cannot transition from terminal state "${wa.status}"`, 400);
    }

    const updates = {
      status: newStatus,
      updatedBy: actorId,
    };

    // Capture actual timestamps for SLA tracking
    if (newStatus === 'arrived') {
      updates['ai.travelTime'] = null; // will be calculated by GPS integration
      updates['sla.actualArrival'] = new Date();
    }

    if (['completed', 'closed'].includes(newStatus)) {
      updates['sla.actualCompletion'] = new Date();
      if (meta.customerRating)       updates['ai.customerRating'] = meta.customerRating;
      if (meta.firstVisitResolution !== undefined) updates['ai.firstVisitResolution'] = meta.firstVisitResolution;
    }

    // Check SLA breach on close
    if (newStatus === 'closed' || newStatus === 'completed') {
      const now = new Date();
      if (wa.sla?.completionDeadline && now > wa.sla.completionDeadline) {
        updates['sla.breached'] = true;
        updates['sla.breachType'] = 'completion';
      }
    }

    return repo.updateById(orgId, id, updates);
  }

  async complete(orgId, id, actorId, completionData) {
    const updated = await this.updateStatus(orgId, id, 'completed', actorId, completionData);

    // Calculate actual duration from scheduledAt → actualCompletion
    if (updated.scheduledAt && updated.sla?.actualCompletion) {
      const durationMins = Math.round(
        (new Date(updated.sla.actualCompletion) - new Date(updated.scheduledAt)) / 60000
      );
      await repo.updateById(orgId, id, { 'ai.actualDuration': durationMins });
    }

    return repo.getById(orgId, id);
  }

  async getStats(orgId) {
    const [raw] = await repo.getStats(orgId);
    return {
      byStatus:   raw?.byStatus    || [],
      byPriority: raw?.byPriority  || [],
      sla:        raw?.sla?.[0]    || { total: 0, breached: 0, withSla: 0 },
      completion: raw?.completion?.[0] || {},
    };
  }

  async getSlaAtRisk(orgId) {
    return repo.getSlaAtRisk(orgId);
  }
}

module.exports = new WorkAssignmentService();
