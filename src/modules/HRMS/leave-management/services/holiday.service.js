const mongoose = require('mongoose');
const repo = require('../repository/holiday.repository');
const AttendanceDaily = require('../../attendance/models/attendanceDaily.model');
const User = require('../../../auth/core/user.model');
const AppError = require('../../../../core/utils/api/appError');
const { startOfDay, endOfDay } = require('../../../../core/utils/dateHelpers');

class HolidayService {

  // --- Domain Logic ---

  async _validateUniqueness(orgId, targetDate, branchId, excludeId = null, session = null) {
    const dayStart = startOfDay(targetDate);
    const dayEnd = endOfDay(targetDate);

    const existing = await repo.findExistingDate(orgId, dayStart, dayEnd, branchId, excludeId, session);
    if (existing) throw new AppError(`A holiday already exists on ${targetDate.toDateString()} for this scope`, 400);
  }

  // FIX BUG-HO-C01 & BUG-HO-C05
  async _syncHolidayToAttendance(holiday, session) {
    const query = { organizationId: holiday.organizationId, isActive: true };
    if (holiday.branchId) query.branchId = holiday.branchId;

    const users = await User.find(query).select('_id').lean().session(session);
    if (users.length === 0) return;

    const dayStart = startOfDay(holiday.date);

    const bulkOps = users.map(user => ({
      updateOne: {
        filter: {
          user: user._id,
          organizationId: holiday.organizationId,
          date: { $gte: dayStart, $lte: endOfDay(holiday.date) }
        },
        update: {
          $set: holiday.isOptional
            ? { holidayId: holiday._id } // Optional doesn't force 'holiday' status
            : { status: 'holiday', holidayId: holiday._id, totalWorkHours: 0 },
          $setOnInsert: {
            user: user._id,
            organizationId: holiday.organizationId,
            branchId: holiday.branchId,
            date: dayStart
          }
        },
        upsert: true
      }
    }));

    await AttendanceDaily.bulkWrite(bulkOps, { session });
  }

  async _unsetHolidayFromAttendance(orgId, holidayId, session) {
    await AttendanceDaily.updateMany(
      { organizationId: orgId, holidayId: holidayId },
      { $unset: { holidayId: 1 }, $set: { status: 'absent' } },
      { session }
    );
  }

  // --- Core Endpoints ---

  async create(orgId, payload, actorId) {
    await this._validateUniqueness(orgId, payload.date, payload.branchId);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      payload.createdBy = actorId;
      payload.updatedBy = actorId;

      const [holiday] = await repo.create(orgId, [payload], session);
      await this._syncHolidayToAttendance(holiday, session);

      await session.commitTransaction();
      return holiday;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // FIX BUG-HO-C04: Time-drift safe comparison
  async update(orgId, id, payload, actorId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const holiday = await repo.getById(orgId, id, session);
      if (!holiday) {
        await session.abortTransaction();
        throw new AppError('Holiday not found', 404);
      }

      const dateChanged = payload.date && new Date(payload.date).getTime() !== holiday.date.getTime();
      const branchChanged = payload.branchId !== undefined && payload.branchId !== holiday.branchId?.toString();

      if (dateChanged || branchChanged) {
        await this._validateUniqueness(orgId, payload.date || holiday.date, payload.branchId ?? holiday.branchId, id, session);
      }

      payload.updatedBy = actorId;
      const updated = await repo.updateById(orgId, id, payload, session);

      if (dateChanged || branchChanged) {
        await this._unsetHolidayFromAttendance(orgId, holiday._id, session);
        await this._syncHolidayToAttendance(updated, session);
      }

      await session.commitTransaction();
      return updated;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async delete(orgId, id) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const holiday = await repo.getById(orgId, id, session);
      if (!holiday) {
        await session.abortTransaction();
        throw new AppError('Holiday not found', 404);
      }

      await this._unsetHolidayFromAttendance(orgId, holiday._id, session);
      await repo.deleteById(orgId, id, session);

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // --- Bulk Operations ---

  async bulkCreate(orgId, payload, actorId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const results = { created: [], duplicates: [], errors: [] };

      for (const data of payload.holidays) {
        try {
          const dayStart = startOfDay(new Date(data.date));
          const dayEnd = endOfDay(new Date(data.date));
          const existing = await repo.findExistingDate(orgId, dayStart, dayEnd, data.branchId, null, session);

          if (existing) { results.duplicates.push(data); continue; }

          data.year = payload.year || new Date(data.date).getFullYear();
          data.createdBy = actorId;
          data.updatedBy = actorId;

          const [holiday] = await repo.create(orgId, [data], session);
          await this._syncHolidayToAttendance(holiday, session);
          results.created.push(holiday);
        } catch (error) {
          results.errors.push({ data, error: error.message });
        }
      }

      await session.commitTransaction();
      return results;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // FIX BUG-HO-C03: Recurring path check inside transaction
  async copyFromYear(orgId, fromYear, toYear, branchId, actorId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const query = { organizationId: orgId, year: fromYear, 'recurring.isRecurring': { $ne: true } };
      if (branchId) query.$or = [{ branchId: new mongoose.Types.ObjectId(branchId) }, { branchId: null }];

      const sourceHolidays = await mongoose.model('Holiday').find(query).session(session);
      const results = [];

      for (const source of sourceHolidays) {
        const newDate = new Date(source.date);
        newDate.setFullYear(toYear);

        const dayStart = startOfDay(newDate);
        const dayEnd = endOfDay(newDate);

        const existing = await repo.findExistingDate(orgId, dayStart, dayEnd, source.branchId, null, session);

        if (!existing) {
          const holidayData = source.toObject();
          delete holidayData._id; delete holidayData.createdAt; delete holidayData.updatedAt;
          
          holidayData.date = newDate;
          holidayData.year = toYear;
          holidayData.createdBy = actorId;
          holidayData.updatedBy = actorId;

          const [newHoliday] = await repo.create(orgId, [holidayData], session);
          await this._syncHolidayToAttendance(newHoliday, session);
          results.push(newHoliday);
        }
      }

      await session.commitTransaction();
      return results;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async buildCalendar(orgId, year, branchId) {
    const holidays = await repo.getByYear(orgId, year, branchId);
    
    const calendar = [];
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    const current = new Date(startDate);

    while (current <= endDate) {
      const curYear = current.getFullYear();
      const curMonth = current.getMonth() + 1;
      const curDay = current.getDate();

      // FIX BUG-HO-C07: Use stored derived fields to bypass timezone mismatch errors
      const dayHolidays = holidays.filter(h => h.year === curYear && h.month === curMonth && h.day === curDay);

      calendar.push({
        date: `${curYear}-${String(curMonth).padStart(2,'0')}-${String(curDay).padStart(2,'0')}`,
        dayOfWeek: current.getDay(),
        isHoliday: dayHolidays.length > 0,
        holidays: dayHolidays,
      });

      current.setDate(current.getDate() + 1);
    }
    return { year, total: holidays.length, calendar };
  }
}

module.exports = new HolidayService();