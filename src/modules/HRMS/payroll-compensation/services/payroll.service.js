'use strict';

const mongoose = require('mongoose');
const Payslip = require('../models/payslip.model');
const SalaryStructure = require('../models/salaryStructure.model');
const Employee = require('../../core-hr/models/employee.model');
const ApiFeatures = require('../../../../core/utils/api/ApiFeatures');
const AppError = require('../../../../core/utils/api/appError');

class PayrollService {
  async runMonthlyPayroll(orgId, { month, year, branchId }, actorId) {
    month = Number(month);
    year = Number(year);

    if (!month || month < 1 || month > 12) throw new AppError('Valid month (1-12) required', 400);
    if (!year || year < 2000) throw new AppError('Valid year required', 400);

    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const totalDaysInMonth = periodEnd.getUTCDate();

    // Query active employees in organization
    const employeeFilter = { organizationId: orgId, status: { $in: ['active', 'probation', 'notice_period'] } };
    if (branchId) employeeFilter.branchId = branchId;

    const employees = await Employee.find(employeeFilter)
      .populate('user', 'name email')
      .populate('compensation.salaryStructureId')
      .lean();

    const createdPayslips = [];
    const skippedEmployees = [];

    for (const emp of employees) {
      const userId = emp.user?._id || emp.user;
      if (!userId) {
        skippedEmployees.push({ employeeId: emp.employeeId, reason: 'No linked user account' });
        continue;
      }

      // Check if payslip already exists and is locked or paid
      const existing = await Payslip.findOne({
        organizationId: orgId,
        user: userId,
        month,
        year,
      });

      if (existing && ['locked', 'paid'].includes(existing.status)) {
        skippedEmployees.push({ employeeId: emp.employeeId, reason: `Payslip already ${existing.status}` });
        continue;
      }

      // 1. Gather Attendance Snapshot
      let presentDays = 0;
      let halfDays = 0;
      let unpaidDays = 0;
      let overtimeHours = 0;
      let lateCount = 0;

      if (mongoose.models['AttendanceDaily']) {
        const dailies = await mongoose.model('AttendanceDaily').find({
          organizationId: orgId,
          $or: [{ user: userId }, { employeeRef: emp._id }],
          date: { $gte: periodStart, $lte: periodEnd },
        }).lean();

        for (const d of dailies) {
          if (d.status === 'present') presentDays++;
          else if (d.status === 'half_day') halfDays += 0.5;
          else if (d.status === 'absent') unpaidDays++;
          if (d.isLate) lateCount++;
          if (d.overtimeHours) overtimeHours += d.overtimeHours;
        }
      }

      const totalWorkedDays = presentDays + halfDays;
      const paidDays = Math.max(0, totalDaysInMonth - unpaidDays);

      // 2. Resolve Salary Structure
      let structure = emp.compensation?.salaryStructureId;
      if (!structure || typeof structure !== 'object' || !structure.components) {
        structure = await SalaryStructure.findOne({
          organizationId: orgId,
          $or: [{ user: userId }, { employeeId: emp._id }],
          status: 'active',
        }).lean();
      }

      const earnings = [];
      const deductions = [];
      const reimbursements = [];

      if (structure && structure.components && structure.components.length > 0) {
        const attendanceFactor = totalDaysInMonth > 0 ? (paidDays / totalDaysInMonth) : 1;

        for (const comp of structure.components) {
          const compAmount = Number(comp.amount) || 0;
          if (comp.category === 'earning') {
            // Prorate basic & variable earnings based on attendance
            const proratedAmount = comp.isVariable ? compAmount : Math.round(compAmount * attendanceFactor);
            earnings.push({
              code: comp.code,
              name: comp.name,
              amount: proratedAmount,
              taxable: comp.taxable ?? true,
              source: 'salary_structure',
            });
          } else if (comp.category === 'deduction') {
            deductions.push({
              code: comp.code,
              name: comp.name,
              amount: compAmount,
              taxable: false,
              source: 'salary_structure',
            });
          } else if (comp.category === 'reimbursement') {
            reimbursements.push({
              code: comp.code,
              name: comp.name,
              amount: compAmount,
              taxable: false,
              source: 'salary_structure',
            });
          }
        }
      } else {
        // Fallback to basic compensation from Employee record
        const monthlyCtc = (emp.compensation?.ctcAnnual ? Math.round(emp.compensation.ctcAnnual / 12) : 25000);
        const attendanceFactor = totalDaysInMonth > 0 ? (paidDays / totalDaysInMonth) : 1;
        earnings.push({
          code: 'BASIC',
          name: 'Basic Salary',
          amount: Math.round(monthlyCtc * attendanceFactor),
          taxable: true,
          source: 'manual',
        });
      }

      // Add approved expense claims if any for this month
      if (mongoose.models['ExpenseClaim']) {
        const approvedClaims = await mongoose.model('ExpenseClaim').find({
          organizationId: orgId,
          user: userId,
          status: 'approved',
          payslipId: null,
        });

        for (const claim of approvedClaims) {
          reimbursements.push({
            code: 'EXP_REIMBURSE',
            name: `Reimbursement: ${claim.title || claim.claimNumber}`,
            amount: claim.approvedAmount || claim.totalAmount,
            taxable: false,
            source: 'expense',
            referenceId: claim._id,
          });
        }
      }

      const payslipCode = `PAY-${year}${String(month).padStart(2, '0')}-${emp.employeeId || emp._id.toString().slice(-4).toUpperCase()}`;

      const payslipData = {
        organizationId: orgId,
        branchId: emp.branchId,
        user: userId,
        employeeId: emp._id,
        salaryStructureId: structure?._id,
        payslipNumber: payslipCode,
        month,
        year,
        periodStart,
        periodEnd,
        attendanceSnapshot: {
          paidDays,
          presentDays: totalWorkedDays,
          leaveDays: 0,
          unpaidLeaveDays: unpaidDays,
          overtimeHours,
          lateCount,
        },
        earnings,
        deductions,
        reimbursements,
        currency: emp.compensation?.currency || 'INR',
        status: 'draft',
        createdBy: actorId,
        updatedBy: actorId,
      };

      const payslip = await Payslip.findOneAndUpdate(
        { organizationId: orgId, user: userId, month, year },
        { $set: payslipData },
        { upsert: true, new: true, runValidators: true }
      );

      // Link any included expense claims to this payslip
      if (mongoose.models['ExpenseClaim']) {
        const claimIds = reimbursements.filter(r => r.source === 'expense').map(r => r.referenceId).filter(Boolean);
        if (claimIds.length > 0) {
          await mongoose.model('ExpenseClaim').updateMany(
            { _id: { $in: claimIds } },
            { $set: { payslipId: payslip._id, status: 'reimbursed', reimbursedAt: new Date() } }
          );
        }
      }

      createdPayslips.push(payslip);
    }

    const totalGross = createdPayslips.reduce((sum, p) => sum + (p.grossPay || 0), 0);
    const totalNet = createdPayslips.reduce((sum, p) => sum + (p.netPay || 0), 0);

    return {
      month,
      year,
      totalEmployees: employees.length,
      processedCount: createdPayslips.length,
      skippedCount: skippedEmployees.length,
      totalGross,
      totalNet,
      skippedDetails: skippedEmployees,
    };
  }

  async getPayslipList(orgId, queryString) {
    const filter = { organizationId: orgId };
    if (queryString.month) filter.month = Number(queryString.month);
    if (queryString.year) filter.year = Number(queryString.year);
    if (queryString.status) filter.status = queryString.status;
    if (queryString.user) filter.user = queryString.user;
    if (queryString.employeeId) filter.employeeId = queryString.employeeId;

    const features = new ApiFeatures(Payslip.find(filter), queryString)
      .filter()
      .search(['payslipNumber'])
      .sort()
      .limitFields()
      .paginate()
      .populate([
        { path: 'user', select: 'name email avatar' },
        { path: 'employeeId', select: 'employeeId firstName lastName displayName departmentId designationId', populate: [{ path: 'departmentId', select: 'name' }, { path: 'designationId', select: 'title' }] },
        { path: 'branchId', select: 'name' },
      ]);

    return await features.execute();
  }

  async getById(orgId, id) {
    const payslip = await Payslip.findOne({ _id: id, organizationId: orgId })
      .populate('user', 'name email avatar phone')
      .populate({
        path: 'employeeId',
        select: 'employeeId firstName lastName displayName departmentId designationId branchId',
        populate: [
          { path: 'departmentId', select: 'name code' },
          { path: 'designationId', select: 'title code' },
        ],
      })
      .populate('branchId', 'name')
      .populate('salaryStructureId');

    if (!payslip) throw new AppError('Payslip not found', 404);
    return payslip;
  }

  async updateStatus(orgId, id, payload, actorId) {
    const payslip = await Payslip.findOne({ _id: id, organizationId: orgId });
    if (!payslip) throw new AppError('Payslip not found', 404);

    const update = { status: payload.status, updatedBy: actorId };

    if (payload.status === 'approved') {
      update.approvedBy = actorId;
      update.approvedAt = new Date();
    } else if (payload.status === 'locked') {
      update.lockedAt = new Date();
    } else if (payload.status === 'paid') {
      update['payment.status'] = 'paid';
      update['payment.paidAt'] = new Date();
      if (payload.paymentMode) update['payment.paymentMode'] = payload.paymentMode;
      if (payload.referenceNo) update['payment.referenceNo'] = payload.referenceNo;
    }

    return await Payslip.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: update },
      { new: true, runValidators: true }
    ).populate('user', 'name email');
  }

  async bulkUpdateStatus(orgId, { ids, status, paymentMode }, actorId) {
    const update = { status, updatedBy: actorId };
    if (status === 'approved') {
      update.approvedBy = actorId;
      update.approvedAt = new Date();
    } else if (status === 'paid') {
      update['payment.status'] = 'paid';
      update['payment.paidAt'] = new Date();
      if (paymentMode) update['payment.paymentMode'] = paymentMode;
    }

    const result = await Payslip.updateMany(
      { _id: { $in: ids }, organizationId: orgId },
      { $set: update }
    );

    return result;
  }
}

module.exports = new PayrollService();