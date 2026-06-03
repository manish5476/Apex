'use strict';

const mongoose = require('mongoose');
const models = require('../src/modules/HRMS/models');

const oid = () => new mongoose.Types.ObjectId();

describe('HRMS model foundations', () => {
  test('loads complete HRMS domain models', () => {
    expect(models).toEqual(expect.objectContaining({
      Employee: expect.any(Function),
      SalaryStructure: expect.any(Function),
      Payslip: expect.any(Function),
      TaxDeduction: expect.any(Function),
      ExpenseClaim: expect.any(Function),
      CompanyAsset: expect.any(Function),
      EmployeeDocument: expect.any(Function),
      Goal: expect.any(Function),
      ReviewCycle: expect.any(Function),
      Feedback: expect.any(Function),
      LeaveTransaction: expect.any(Function),
    }));
  });

  test('validates representative records for missing HRMS modules', async () => {
    const organizationId = oid();
    const user = oid();

    const docs = [
      new models.Employee({
        organizationId,
        user,
        employeeId: 'SE-001',
        dateOfJoining: new Date('2025-01-01'),
      }),
      new models.SalaryStructure({
        organizationId,
        user,
        title: 'Default Structure',
        effectiveFrom: new Date('2026-04-01'),
        components: [{ name: 'Basic', code: 'BASIC', category: 'earning', amount: 10000 }],
      }),
      new models.Payslip({
        organizationId,
        user,
        month: 5,
        year: 2026,
        periodStart: new Date('2026-05-01'),
        periodEnd: new Date('2026-05-31'),
        earnings: [{ name: 'Basic', code: 'BASIC', amount: 10000 }],
        deductions: [{ name: 'TDS', code: 'TDS', amount: 1000, source: 'tax' }],
      }),
      new models.TaxDeduction({
        organizationId,
        user,
        financialYear: '2026-2027',
        taxType: 'tds',
        deductionAmount: 1000,
      }),
      new models.ExpenseClaim({
        organizationId,
        user,
        title: 'Travel Claim',
        items: [{ category: 'travel', expenseDate: new Date('2026-05-10'), amount: 500 }],
      }),
      new models.CompanyAsset({
        organizationId,
        assetCode: 'LAP-001',
        name: 'Store Laptop',
        category: 'laptop',
      }),
      new models.EmployeeDocument({
        organizationId,
        user,
        documentType: 'pan',
        title: 'PAN Card',
        assetId: oid(),
      }),
      new models.ReviewCycle({
        organizationId,
        name: 'Annual Review 2026',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-12-31'),
      }),
      new models.Goal({
        organizationId,
        user,
        title: 'Improve Sales Conversion',
        startDate: new Date('2026-01-01'),
        dueDate: new Date('2026-03-31'),
        keyResults: [{ title: 'Reach target', targetValue: 100, currentValue: 50 }],
      }),
      new models.Feedback({
        organizationId,
        subjectUser: user,
        reviewer: user,
        feedbackType: 'self',
      }),
      new models.LeaveTransaction({
        organizationId,
        user,
        leaveBalanceId: oid(),
        financialYear: '2026-2027',
        leaveType: 'casualLeave',
        changeType: 'credited',
        amount: 1,
        balanceBefore: 0,
        runningBalance: 1,
      }),
    ];

    await Promise.all(docs.map((doc) => doc.validate()));
    expect(docs[2].netPay).toBe(9000);
    expect(docs[4].totalAmount).toBe(500);
    expect(docs[8].progress).toBe(50);
  });

  test('rejects invalid cross-field HRMS dates', async () => {
    const organizationId = oid();
    const user = oid();

    const employee = new models.Employee({
      organizationId,
      user,
      employeeId: 'SE-002',
      dateOfJoining: new Date('2026-06-01'),
      dateOfExit: new Date('2026-05-01'),
    });

    await expect(employee.validate()).rejects.toThrow('dateOfExit cannot be before dateOfJoining');
  });
});
