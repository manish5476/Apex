const mongoose = require('mongoose');
const repo = require('../repository/shiftGroup.repository');
const ShiftAssignment = require('../models/shiftAssignment.model');
const User = require('../../../auth/core/user.model');
const AppError = require('../../../../core/utils/api/appError');

class ShiftGroupService {

  async _validateShiftGroupData(orgId, data, excludeId = null) {
    if (data.name || data.code) {
      const exists = await repo.getByNameOrCode(orgId, data.name, data.code, excludeId);
      if (exists) {
        if (exists.name === data.name) throw new AppError('Shift group with this name already exists', 400);
        if (exists.code === data.code) throw new AppError('Shift group with this code already exists', 400);
      }
    }

    if (data.shifts?.length) {
      const uniqueShiftIds = [...new Set(data.shifts.map(s => s.shiftId))];
      const allValid = await repo.validateShiftsExist(orgId, uniqueShiftIds);
      if (!allValid) throw new AppError('One or more shifts are invalid or inactive', 400);
    }
  }

  async create(orgId, payload, actorId) {
    await this._validateShiftData(orgId, payload);
    payload.createdBy = actorId;
    payload.updatedBy = actorId;
    return repo.create(orgId, payload);
  }

  async update(orgId, id, payload, actorId) {
    await this._validateShiftGroupData(orgId, payload, id);
    payload.updatedBy = actorId;
    const group = await repo.updateById(orgId, id, payload);
    if (!group) throw new AppError('Shift group not found', 404);
    return group;
  }

  async delete(orgId, id, actorId) {
    const group = await repo.getById(orgId, id);
    if (!group) throw new AppError('Shift group not found', 404);

    const assignedUsers = await User.countDocuments({ organizationId: orgId, 'attendanceConfig.shiftGroupId': id, isActive: true });
    if (assignedUsers > 0) throw new AppError(`Cannot delete group assigned to ${assignedUsers} active users.`, 400);

    return repo.updateById(orgId, id, { isActive: false, updatedBy: actorId });
  }

  // --- Core Domain Logic: Roster Generation ---

  async generateRotationSchedule(orgId, groupId, startDate, endDate, userIds, actorId) {
    const group = await repo.getById(orgId, groupId);
    if (!group || !group.isActive) throw new AppError('Active Shift group not found', 404);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const shiftCount = group.shifts.length;
    
    if (shiftCount === 0) throw new AppError('Shift group has no shifts configured.', 400);

    // 1. Math generation in memory
    const schedule = [];
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);

      let shiftIndex;
      switch (group.rotationType) {
        case 'daily':   shiftIndex = i % shiftCount; break;
        case 'weekly':  shiftIndex = Math.floor(i / 7) % shiftCount; break;
        case 'monthly': shiftIndex = Math.floor(i / 30) % shiftCount; break;
        default: {
          const pattern = group.rotationPattern?.find(p => p.dayOffset === i);
          shiftIndex = pattern ? group.shifts.findIndex(s => s.shiftId._id.toString() === pattern.shiftId.toString()) : i % shiftCount;
        }
      }

      if (shiftIndex >= 0 && shiftIndex < shiftCount) {
        schedule.push({ date: new Date(currentDate), shift: group.shifts[shiftIndex].shiftId, dayNumber: i + 1 });
      }
    }

    let assignmentCount = 0;

    // 2. Transactional Insertion if users provided
    if (userIds?.length) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const docs = [];
        for (const userId of userIds) {
          for (const day of schedule) {
            docs.push({
              user: userId, organizationId: orgId, shiftId: day.shift._id, shiftGroupId: group._id,
              startDate: day.date, endDate: day.date, isTemporary: true, rotationSequence: day.dayNumber,
              assignedBy: actorId, status: 'active',
            });
          }
        }
        await ShiftAssignment.insertMany(docs, { session });
        assignmentCount = docs.length;
        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    }

    return { group: group.name, rotationType: group.rotationType, totalDays: days, schedule, assignments: assignmentCount };
  }

  // FIX: Upgraded to strict transaction.
  async assignGroupToUsers(orgId, groupId, userIds, startDateStr, endDateStr, actorId) {
    const group = await repo.getById(orgId, groupId);
    if (!group || !group.isActive) throw new AppError('Active Shift group not found', 404);

    const validUsers = await User.find({ _id: { $in: userIds }, organizationId: orgId, isActive: true }).select('_id');
    if (validUsers.length !== userIds.length) throw new AppError('One or more users are invalid or inactive.', 400);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // FIX BUG-SG-C01: Safe date subtraction
      const dayBeforeStart = new Date(new Date(startDateStr).getTime() - 86_400_000);
      
      const newAssignments = [];

      for (const user of validUsers) {
        // Expire old ones safely
        await ShiftAssignment.updateMany(
          { user: user._id, organizationId: orgId, status: 'active' },
          { $set: { status: 'expired', endDate: dayBeforeStart } },
          { session }
        );

        newAssignments.push({
          user: user._id, organizationId: orgId, shiftGroupId: group._id,
          startDate: new Date(startDateStr), endDate: endDateStr ? new Date(endDateStr) : null,
          assignedBy: actorId, status: 'active',
        });
      }

      const assignments = await ShiftAssignment.insertMany(newAssignments, { session });
      
      await session.commitTransaction();
      return { group: group.name, assignedUsers: assignments.length, assignments };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new ShiftGroupService();