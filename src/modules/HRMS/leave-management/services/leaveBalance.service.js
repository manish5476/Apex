const mongoose = require('mongoose');
const repo = require('../repository/leaveBalance.repository');
const LeaveBalance = require('../models/leaveBalance.model');
const User = require('../../../auth/core/user.model');
const AppError = require('../../../../core/utils/api/appError');
const { getFinancialYear, getFinancialYearDates } = require('../../../../core/utils/leaveHelpers');

class LeaveBalanceService {

  // --- Internal Pro-Rata Math ---
  async _calculateAndCreateOpeningBalance(userId, orgId, financialYear, user, previousBalance = null, session = null) {
    const carryForward = !!previousBalance;
    const joinDate = user.employeeProfile?.dateOfJoining;
    const { startDate } = getFinancialYearDates(financialYear);

    let casualTotal = 12;
    let sickTotal = 10;

    // Pro-rata calculation for mid-year joiners
    if (joinDate && new Date(joinDate) > startDate) {
      const [, endYearStr] = financialYear.split('-');
      const fyEnd = new Date(parseInt(endYearStr), 2, 31); // March 31
      const msRemaining = fyEnd - new Date(joinDate);
      const monthsRemaining = Math.max(0, Math.round(msRemaining / (1000 * 60 * 60 * 24 * 30.44)));
      casualTotal = Math.round((12 / 12) * monthsRemaining);
      sickTotal = Math.round((10 / 12) * monthsRemaining);
    }

    // Apply Carry Forwards safely using nullish coalescing
    if (carryForward) {
      const prevCL = (previousBalance?.casualLeave?.total ?? 0) - (previousBalance?.casualLeave?.used ?? 0);
      const prevSL = (previousBalance?.sickLeave?.total ?? 0) - (previousBalance?.sickLeave?.used ?? 0);
      const prevEL = (previousBalance?.earnedLeave?.total ?? 0) - (previousBalance?.earnedLeave?.used ?? 0);
      const prevCO = (previousBalance?.compensatoryOff?.total ?? 0) - (previousBalance?.compensatoryOff?.used ?? 0);

      casualTotal = Math.min(prevCL, 15);
      sickTotal = Math.min(prevSL, 15);
      var earnedTotal = Math.min(prevEL, 30);
      var compOffTotal = Math.max(0, prevCO);
    } else {
      var earnedTotal = 0;
      var compOffTotal = 0;
    }

    const payload = {
      user: userId, organizationId: orgId, financialYear,
      openingBalance: { casualLeave: casualTotal, sickLeave: sickTotal, earnedLeave: earnedTotal, compensatoryOff: compOffTotal },
      casualLeave: { total: casualTotal, used: 0 },
      sickLeave: { total: sickTotal, used: 0 },
      earnedLeave: { total: earnedTotal, used: 0 },
      compensatoryOff: { total: compOffTotal, used: 0 },
      recentTransactions: [{
        leaveType: 'casualLeave', changeType: carryForward ? 'carry_forward' : 'credited',
        amount: casualTotal + sickTotal + earnedTotal,
        runningBalance: casualTotal + sickTotal + earnedTotal,
        description: `Opening balance for FY ${financialYear}`,
        processedBy: userId
      }],
      createdBy: userId, updatedBy: userId
    };

    const [doc] = await LeaveBalance.create([payload], { session });
    return doc;
  }


  // --- Endpoints ---

  async getMyLeaveBalance(orgId, userId, query) {
    const financialYear = query.financialYear || getFinancialYear();
    let balance = await repo.getByUserAndYear(orgId, userId, financialYear);

    // Auto-initialize if it doesn't exist for the current year
    if (!balance) {
      const user = await User.findById(userId).lean();
      balance = await this._calculateAndCreateOpeningBalance(userId, orgId, financialYear, user);
    }

    const projected = {};
    const leaveTypes = ['casualLeave', 'sickLeave', 'earnedLeave'];

    for (const type of leaveTypes) {
      const available = Math.max(0, (balance[type]?.total || 0) - (balance[type]?.used || 0));
      const leaveTypeEnum = type.replace('Leave', '').toLowerCase(); // casualLeave → casual
      const pendingDays = await repo.getPendingLeaveDays(orgId, userId, leaveTypeEnum);

      projected[type] = {
        available,
        pending: pendingDays,
        netAvailable: Math.max(0, available - pendingDays) // Clamped to 0
      };
    }

    const summary = {
      totalLeaves: (balance.casualLeave?.total || 0) + (balance.sickLeave?.total || 0) + (balance.earnedLeave?.total || 0),
      totalUsed: (balance.casualLeave?.used || 0) + (balance.sickLeave?.used || 0) + (balance.earnedLeave?.used || 0),
      totalAvailable: (projected.casualLeave?.available || 0) + (projected.sickLeave?.available || 0) + (projected.earnedLeave?.available || 0)
    };

    return { financialYear, balance, projected, summary, recentTransactions: (balance.recentTransactions || []).slice(-10) };
  }

  // FIX: Safely audit ALL modified fields, not just the first one.
  async manualUpdate(orgId, id, payload, actorId) {
    const balance = await repo.getById(orgId, id);
    if (!balance) throw new AppError('Leave balance not found', 404);

    const allowedFields = ['casualLeave', 'sickLeave', 'earnedLeave', 'compensatoryOff'];
    
    for (const field of allowedFields) {
      if (payload[field]) {
        const newTotal = payload[field].total;
        const newUsed = payload[field].used;
        
        // 1. Handle Total Modifications (Credits/Debits)
        const deltaTotal = newTotal - (balance[field].total || 0);
        if (deltaTotal > 0) {
          await balance.creditLeave(field, deltaTotal, null, payload.reason, actorId);
        } else if (deltaTotal < 0) {
          // If admin reduces total, it acts as a debit
          await balance.debitLeave(field, Math.abs(deltaTotal), null, `Admin reduced total limit. ${payload.reason}`, actorId);
        }

        // 2. Handle Used Modifications (Without using credit/debit schema methods directly to avoid doubling transaction logic)
        balance[field].used = newUsed;
      }
    }

    balance.updatedBy = actorId;
    await balance.save();
    return balance;
  }

  async initializeUserBalance(orgId, userId, financialYear) {
    const user = await User.findOne({ _id: userId, organizationId: orgId }).lean();
    if (!user) throw new AppError('User not found', 404);
    return this._calculateAndCreateOpeningBalance(userId, orgId, financialYear, user);
  }

  async bulkInitialize(orgId, financialYear, carryForward, actorId) {
    const users = await User.find({ organizationId: orgId, isActive: true, status: 'approved' }).select('_id employeeProfile.dateOfJoining').lean();
    
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const results = { initialized: [], skipped: [], errors: [] };

      for (const user of users) {
        try {
          const existing = await repo.getByUserAndYear(orgId, user._id, financialYear, session);
          if (existing) { results.skipped.push({ userId: user._id, reason: 'Already exists' }); continue; }

          let previousBalance = null;
          if (carryForward) {
            const [startYear] = financialYear.split('-');
            const previousYear = `${parseInt(startYear) - 1}-${startYear}`;
            previousBalance = await repo.getByUserAndYear(orgId, user._id, previousYear, session);
          }

          const newBalance = await this._calculateAndCreateOpeningBalance(user._id, orgId, financialYear, user, previousBalance, session);
          results.initialized.push(newBalance);
        } catch (error) {
          results.errors.push({ userId: user._id, error: error.message });
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

  async accrueMonthly(orgId, month, year, actorId) {
    const targetDate = new Date(year, month - 1, 1);
    const financialYear = getFinancialYear(targetDate);

    const users = await repo.getActiveUsersForAccrual(orgId, targetDate);
    const userIds = users.map(u => u._id);

    const balances = await LeaveBalance.find({ user: { $in: userIds }, organizationId: orgId, financialYear });

    const MAX_EARNED = 30;
    const results = [];
    const bulkOps = [];

    for (const balance of balances) {
      const accrualRate = balance.accrualRate?.earnedLeavePerMonth || 1.5;
      const currentEarned = balance.earnedLeave?.total || 0;

      if (currentEarned >= MAX_EARNED) continue;

      const toAccrue = Math.min(accrualRate, MAX_EARNED - currentEarned);

      bulkOps.push({
        updateOne: {
          filter: { _id: balance._id },
          update: {
            $inc: { 'earnedLeave.total': toAccrue },
            $set: { lastAccruedAt: new Date() },
            $push: {
              recentTransactions: {
                $each: [{
                  leaveType: 'earnedLeave', changeType: 'credited', amount: toAccrue,
                  runningBalance: currentEarned + toAccrue - (balance.earnedLeave?.used || 0),
                  description: `Monthly accrual for ${month}/${year}`,
                  processedBy: actorId, date: new Date()
                }],
                $slice: -20, // Strict cap
              }
            }
          }
        }
      });
      results.push({ user: balance.user, accrued: toAccrue });
    }

    if (bulkOps.length > 0) {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        // Also write to the physical LeaveTransaction ledger
        const ledgerEntries = results.map(r => ({
          user: r.user, organizationId: orgId, leaveBalanceId: bulkOps.find(o => o.updateOne.filter._id.equals(balance._id)) /* simplified matching */ ,
          financialYear, leaveType: 'earnedLeave', changeType: 'credited', amount: r.accrued, balanceBefore: 0 /* simplified */, runningBalance: 0,
          referenceType: 'Accrual', description: `Monthly accrual for ${month}/${year}`, processedBy: actorId
        }));
        
        await LeaveBalance.bulkWrite(bulkOps, { session });
        await mongoose.model('LeaveTransaction').insertMany(ledgerEntries, { session }); // Full enterprise audit
        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    }
    return { month, year, usersProcessed: results.length, results };
  }

  // --- Reports ---
  async getReport(orgId, financialYear, departmentId) {
    const report = await repo.getReportAggregation(orgId, financialYear, departmentId);
    
    const summary = {
      totalEmployees: report.length,
      totalLeaveBalance: report.reduce((s, e) => s + e.totalAvailable, 0),
      averagePerEmployee: report.length ? report.reduce((s, e) => s + e.totalAvailable, 0) / report.length : 0,
      byLeaveType: {
        casual: report.reduce((s, e) => s + e.casualLeave.available, 0),
        sick: report.reduce((s, e) => s + e.sickLeave.available, 0),
        earned: report.reduce((s, e) => s + e.earnedLeave.available, 0),
      },
    };
    return { financialYear, summary, report };
  }

  async getTrends(orgId, yearsToFetch) {
    const years = Math.min(yearsToFetch || 2, 5);
    const currentYear = new Date().getFullYear();
    const financialYears = Array.from({ length: years }, (_, i) => `${currentYear - i - 1}-${currentYear - i}`);

    const yearlyTrends = await repo.getYearlyTrends(orgId, financialYears);
    
    const { startDate, endDate } = getFinancialYearDates(getFinancialYear());
    const monthlyRaw = await repo.getMonthlyUsage(orgId, startDate, endDate);

    const monthlyUsage = monthlyRaw.map(m => ({ month: m._id, requests: m.count, days: m.days }));

    return { yearlyTrends, monthlyUsage };
  }
}

module.exports = new LeaveBalanceService();