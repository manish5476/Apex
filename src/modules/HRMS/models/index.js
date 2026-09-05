'use strict';

module.exports = {
  // Core HR
  Department: require('../core-hr/models/department.model'),
  Designation: require('../core-hr/models/designation.model'),
  Employee: require('../core-hr/models/employee.model'),
  CompanyAsset: require('../core-hr/models/companyAsset.model'),
  EmployeeDocument: require('../core-hr/models/employeeDocument.model'),

  // Attendance
  AttendanceDaily: require('../attendance/models/attendanceDaily.model'),
  AttendanceLog: require('../attendance/models/attendanceLog.model'),
  AttendanceMachine: require('../attendance/models/attendanceMachine.model'),
  AttendanceRequest: require('../attendance/models/attendanceRequest.model'),
  AttendanceSummary: require('../attendance/models/attendanceSummary.model'),
  GeoFencing: require('../attendance/models/geoFencing.model'),
  Shift: require('../attendance/models/shift.model'),
  ShiftAssignment: require('../attendance/models/shiftAssignment.model'),
  ShiftGroup: require('../attendance/models/shiftGroup.model'),

  // Leave Management
  Holiday: require('../leave-management/models/holiday.model'),
  LeaveBalance: require('../leave-management/models/leaveBalance.model'),
  LeaveRequest: require('../leave-management/models/leaveRequest.model'),
  LeaveTransaction: require('../leave-management/models/leaveTransaction.model'),

  // Payroll & Compensation
  SalaryStructure: require('../payroll-compensation/models/salaryStructure.model'),
  Payslip: require('../payroll-compensation/models/payslip.model'),
  ExpenseClaim: require('../payroll-compensation/models/expenseClaim.model'),
  TaxDeduction: require('../payroll-compensation/models/taxDeduction.model'),

  // Performance
  Goal: require('../performance/models/goal.model'),
  ReviewCycle: require('../performance/models/reviewCycle.model'),
  Feedback: require('../performance/models/feedback.model'),
};
