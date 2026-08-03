const repo = require('../repository/shift.repository');
const Employee = require('../../core-hr/models/employee.model');
const AppError = require('../../../../core/utils/api/appError');

class ShiftService {

  // --- Internal Math Helpers ---

  _parseTime(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m; // Convert to absolute minutes from 00:00
  }

  _calculateDurationMins(startMins, endMins) {
    let duration = endMins - startMins;
    if (duration < 0) duration += 24 * 60; // Cross-midnight handler
    return duration;
  }

  async _validateShiftData(orgId, data, excludeId = null) {
    if (data.name || data.code) {
      const exists = await repo.getByNameOrCode(orgId, data.name, data.code, excludeId);
      if (exists) {
        if (exists.name === data.name) throw new AppError('Shift with this name already exists', 400);
        if (exists.code === data.code) throw new AppError('Shift with this code already exists', 400);
      }
    }

    if (data.startTime && data.endTime) {
      const startMins = this._parseTime(data.startTime);
      const endMins = this._parseTime(data.endTime);
      const duration = this._calculateDurationMins(startMins, endMins);

      if (duration < 4 * 60) throw new AppError('Shift duration must be at least 4 hours', 400);
    }

    if (data.minFullDayHrs && data.halfDayThresholdHrs && data.minFullDayHrs <= data.halfDayThresholdHrs) {
      throw new AppError('Full day hours must be strictly greater than half day threshold', 400);
    }

    if (data.breaks?.length) {
      for (const br of data.breaks) {
        if (br.startTime && br.endTime) {
          const bStart = this._parseTime(br.startTime);
          const bEnd = this._parseTime(br.endTime);
          if (bStart >= bEnd && (bStart - bEnd) < (12 * 60)) { // Simple guard against backwards breaks
            throw new AppError(`Break ${br.name || 'unnamed'} has invalid timing`, 400);
          }
        }
      }
    }
  }

  // --- CRUD & Operations ---

  async create(orgId, payload, actorId) {
    await this._validateShiftData(orgId, payload);
    payload.createdBy = actorId;
    payload.updatedBy = actorId;
    return repo.create(orgId, payload);
  }

  async update(orgId, id, payload, actorId) {
    await this._validateShiftData(orgId, payload, id);
    payload.updatedBy = actorId;
    const shift = await repo.updateById(orgId, id, payload);
    if (!shift) throw new AppError('Shift not found', 404);
    return shift;
  }

  async delete(orgId, id, actorId) {
    const { assignedUsers, inGroups } = await repo.checkDependencies(orgId, id);
    if (assignedUsers > 0) throw new AppError(`Cannot delete shift assigned to ${assignedUsers} active users.`, 400);
    if (inGroups > 0) throw new AppError('Cannot delete shift as it is part of active shift groups.', 400);

    return repo.updateById(orgId, id, { isActive: false, updatedBy: actorId });
  }

  // --- Specialized Domain Logic ---

  calculateHours(startTime, endTime, breaks = []) {
    const startMins = this._parseTime(startTime);
    const endMins = this._parseTime(endTime);
    const totalMins = this._calculateDurationMins(startMins, endMins);

    let breakMins = 0;
    breaks.forEach(br => {
      if (br.startTime && br.endTime) {
        breakMins += this._calculateDurationMins(this._parseTime(br.startTime), this._parseTime(br.endTime));
      }
    });

    const workMins = Math.max(0, totalMins - breakMins);

    return {
      totalHours: (totalMins / 60).toFixed(2),
      breakHours: (breakMins / 60).toFixed(2),
      workHours: (workMins / 60).toFixed(2),
      crossesMidnight: endMins < startMins
    };
  }

  async getCoverage(orgId, targetDateStr) {
    const targetDate = targetDateStr ? new Date(targetDateStr) : new Date();
    const dayOfWeek = targetDate.getDay();

    const shifts = await repo.getActiveShifts(orgId);
    
    // FIX N+1 Query: Get all counts in one go
    const shiftIds = shifts.map(s => s._id);
    const coverageCounts = await repo.getCoverageCounts(orgId, shiftIds);

    return shifts.map(shift => {
      const isWorkingDay = !shift.weeklyOffs?.includes(dayOfWeek);
      return {
        shift: { _id: shift._id, name: shift.name, code: shift.code, startTime: shift.startTime, endTime: shift.endTime },
        assignedUsers: coverageCounts[shift._id.toString()] || 0,
        isWorkingDay,
        status: isWorkingDay ? 'scheduled' : 'off'
      };
    });
  }

  async clone(orgId, id, actorId) {
    const sourceShift = await repo.getById(orgId, id);
    if (!sourceShift) throw new AppError('Source shift not found', 404);

    const cloneData = sourceShift.toObject();
    delete cloneData._id; delete cloneData.createdAt; delete cloneData.updatedAt;

    // Use random suffix instead of _COPY to prevent _COPY_COPY chaining
    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    cloneData.name = `${cloneData.name} (Copy)`;
    cloneData.code = `${cloneData.code}_${suffix}`;
    cloneData.createdBy = actorId;
    cloneData.updatedBy = actorId;

    await this._validateShiftData(orgId, cloneData);
    return repo.create(orgId, cloneData);
  }

  async getTimeline(orgId, targetDateStr) {
    const targetDate = targetDateStr ? new Date(targetDateStr) : new Date();
    const shifts = await repo.getActiveShifts(orgId);

    const timeline = shifts.map(shift => {
      const start = new Date(targetDate);
      const [sh, sm] = shift.startTime.split(':').map(Number);
      start.setHours(sh, sm, 0, 0);

      const end = new Date(targetDate);
      const [eh, em] = shift.endTime.split(':').map(Number);
      end.setHours(eh, em, 0, 0);

      const crossesMidnight = end < start;
      if (crossesMidnight) end.setDate(end.getDate() + 1);

      // Manually compute duration since lean() strips virtuals
      const durationMins = this._calculateDurationMins(sh * 60 + sm, eh * 60 + em);
      const durationStr = `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`;

      return {
        shift: { _id: shift._id, name: shift.name, code: shift.code, type: shift.shiftType },
        startTime: start,
        endTime: end,
        duration: durationStr,
        isNightShift: (sh >= 20 || sh <= 5 || eh <= 5)
      };
    });

    return timeline.sort((a, b) => a.startTime - b.startTime);
  }

  async validateAssignment(orgId, payload) {
    const shift = await repo.getById(orgId, payload.shiftId);
    if (!shift || !shift.isActive) throw new AppError('Active Shift not found', 404);

    const employee = await Employee.findOne({ user: payload.userId }).select('attendanceConfig');
    if (!employee) throw new AppError('Employee not found', 404);

    const targetDate = payload.date ? new Date(payload.date) : new Date();
    const isWorkingDay = !shift.weeklyOffs?.includes(targetDate.getDay());
    
    const warnings = [];
    if (!isWorkingDay) warnings.push('Selected date is a weekly off for this shift');
    if (employee.attendanceConfig?.shiftId && employee.attendanceConfig.shiftId.toString() !== payload.shiftId) {
      warnings.push('User is already assigned to a different shift');
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      shift: { name: shift.name, timing: `${shift.startTime} - ${shift.endTime}`, isWorkingDay }
    };
  }
}

module.exports = new ShiftService();