const AttendanceDaily = require('../../models/attendance/attendanceDaily.model');
const AttendanceSummary = require('../../models/attendance/attendanceSummary.model');
const User = require('../../../modules/auth/core/user.model');
const Holiday = require('../../models/holiday.model');
const dayjs = require('dayjs');
const ExcelJS = require('exceljs');

class ReportService {
  
  /**
   * Generate monthly attendance report
   */
  async generateMonthlyReport(organizationId, month, options = {}) {
    const { branchId, department, includeInactive } = options;
    
    const startOfMonth = dayjs(month).startOf('month').format('YYYY-MM-DD');
    const endOfMonth = dayjs(month).endOf('month').format('YYYY-MM-DD');
    
    // Get all active users
    const userFilter = {
      organizationId,
      isActive: includeInactive ? { $in: [true, false] } : true
    };
    
    if (branchId) userFilter.branchId = branchId;
    if (department) userFilter.department = department;
    
    const users = await User.find(userFilter)
      .select('_id name email employeeId department position shiftId')
      .lean();
    
    // Get attendance data for the month
    const attendanceData = await AttendanceDaily.find({
      organizationId,
      user: { $in: users.map(u => u._id) },
      date: { $gte: startOfMonth, $lte: endOfMonth }
    })
      .populate('shiftId', 'name startTime endTime')
      .lean();
    
    // Get holidays for the month
    const holidays = await Holiday.find({
      organizationId,
      date: { $gte: startOfMonth, $lte: endOfMonth },
      isActive: true,
      $or: [
        { branchId: branchId || null },
        { branchId: null }
      ]
    }).lean();
    
    // Create holiday map
    const holidayMap = {};
    holidays.forEach(holiday => {
      holidayMap[holiday.date] = {
        name: holiday.name,
        type: holiday.type,
        isOptional: holiday.isOptional
      };
    });
    
    // Generate report for each user
    const userReports = [];
    const attendanceMap = this.createAttendanceMap(attendanceData);
    
    for (const user of users) {
      const report = await this.generateUserMonthlyReport(
        user,
        startOfMonth,
        endOfMonth,
        attendanceMap,
        holidayMap
      );
      userReports.push(report);
    }
    
    // Generate summary
    const summary = this.generateSummary(userReports);
    
    return {
      period: {
        month,
        startDate: startOfMonth,
        endDate: endOfMonth,
        workingDays: summary.totalWorkingDays
      },
      summary,
      userReports,
      generatedAt: new Date()
    };
  }
  
  /**
   * Generate user monthly report
   */
  async generateUserMonthlyReport(user, startDate, endDate, attendanceMap, holidayMap) {
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    const daysInMonth = end.diff(start, 'day') + 1;
    
    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let leaveDays = 0;
    let holidayDays = 0;
    let weekOffDays = 0;
    let totalWorkHours = 0;
    let totalOvertimeHours = 0;
    
    const dailyDetails = [];
    
    for (let i = 0; i < daysInMonth; i++) {
      const currentDate = start.add(i, 'day');
      const dateStr = currentDate.format('YYYY-MM-DD');
      const dayOfWeek = currentDate.day();
      
      const key = `${user._id}_${dateStr}`;
      const record = attendanceMap[key];
      const holiday = holidayMap[dateStr];
      
      let status = 'absent';
      let workHours = 0;
      let overtime = 0;
      let remarks = '';
      
      if (record) {
        status = record.status;
        workHours = record.totalWorkHours || 0;
        overtime = record.overtimeHours || 0;
        
        if (record.isLate) lateDays++;
        if (record.isHalfDay) halfDays++;
        
        switch (status) {
          case 'present':
            presentDays++;
            totalWorkHours += workHours;
            totalOvertimeHours += overtime;
            break;
          case 'absent':
            absentDays++;
            break;
          case 'on_leave':
            leaveDays++;
            break;
          case 'half_day':
            halfDays++;
            presentDays += 0.5;
            totalWorkHours += workHours;
            break;
          case 'holiday':
          case 'holiday_work':
            holidayDays++;
            if (status === 'holiday_work') {
              totalWorkHours += workHours;
              totalOvertimeHours += overtime;
            }
            break;
          case 'week_off':
          case 'week_off_work':
            weekOffDays++;
            if (status === 'week_off_work') {
              totalWorkHours += workHours;
              totalOvertimeHours += overtime;
            }
            break;
        }
      } else if (holiday) {
        status = 'holiday';
        holidayDays++;
      } else if (dayOfWeek === 0 || dayOfWeek === 6) {
        status = 'week_off';
        weekOffDays++;
      } else {
        absentDays++;
      }
      
      dailyDetails.push({
        date: dateStr,
        day: currentDate.format('dddd'),
        status,
        workHours,
        overtime,
        remarks
      });
    }
    
    const attendanceRate = daysInMonth > 0 ? (presentDays / daysInMonth) * 100 : 0;
    
    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department,
        position: user.position
      },
      summary: {
        presentDays,
        absentDays,
        lateDays,
        halfDays,
        leaveDays,
        holidayDays,
        weekOffDays,
        totalHours: totalWorkHours.toFixed(2),
        overtimeHours: totalOvertimeHours.toFixed(2),
        attendanceRate: attendanceRate.toFixed(2),
        workingDays: daysInMonth
      },
      dailyDetails
    };
  }
  
  /**
   * Generate summary from user reports
   */
  generateSummary(userReports) {
    const summary = {
      totalEmployees: userReports.length,
      averageAttendanceRate: 0,
      totalPresentDays: 0,
      totalAbsentDays: 0,
      totalLateOccurrences: 0,
      totalHalfDays: 0,
      totalLeaveDays: 0,
      totalHolidayDays: 0,
      totalWeekOffDays: 0,
      totalWorkHours: 0,
      totalOvertimeHours: 0
    };
    
    userReports.forEach(report => {
      const s = report.summary;
      summary.totalPresentDays += s.presentDays;
      summary.totalAbsentDays += s.absentDays;
      summary.totalLateOccurrences += s.lateDays;
      summary.totalHalfDays += s.halfDays;
      summary.totalLeaveDays += s.leaveDays;
      summary.totalHolidayDays += s.holidayDays;
      summary.totalWeekOffDays += s.weekOffDays;
      summary.totalWorkHours += parseFloat(s.totalHours);
      summary.totalOvertimeHours += parseFloat(s.overtimeHours);
    });
    
    summary.averageAttendanceRate = userReports.length > 0 ?
      userReports.reduce((acc, curr) => acc + parseFloat(curr.summary.attendanceRate), 0) / userReports.length : 0;
    
    return summary;
  }
  
  /**
   * Create attendance map for fast lookup
   */
  createAttendanceMap(attendanceData) {
    const map = {};
    attendanceData.forEach(record => {
      const key = `${record.user}_${record.date}`;
      map[key] = record;
    });
    return map;
  }
  
  /**
   * Export report to Excel
   */
  async exportToExcel(reportData, format = 'excel') {
    const workbook = new ExcelJS.Workbook();
    
    // Summary Sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 }
    ];
    
    const summaryRows = [
      { metric: 'Total Employees', value: reportData.summary.totalEmployees },
      { metric: 'Average Attendance Rate', value: `${reportData.summary.averageAttendanceRate.toFixed(2)}%` },
      { metric: 'Total Present Days', value: reportData.summary.totalPresentDays },
      { metric: 'Total Absent Days', value: reportData.summary.totalAbsentDays },
      { metric: 'Total Late Occurrences', value: reportData.summary.totalLateOccurrences },
      { metric: 'Total Leave Days', value: reportData.summary.totalLeaveDays },
      { metric: 'Total Work Hours', value: reportData.summary.totalWorkHours.toFixed(2) },
      { metric: 'Total Overtime Hours', value: reportData.summary.totalOvertimeHours.toFixed(2) }
    ];
    
    summaryRows.forEach(row => summarySheet.addRow(row));
    
    // Employee Details Sheet
    const detailsSheet = workbook.addWorksheet('Employee Details');
    detailsSheet.columns = [
      { header: 'Employee ID', key: 'employeeId', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Present Days', key: 'presentDays', width: 12 },
      { header: 'Absent Days', key: 'absentDays', width: 12 },
      { header: 'Late Days', key: 'lateDays', width: 12 },
      { header: 'Leave Days', key: 'leaveDays', width: 12 },
      { header: 'Total Hours', key: 'totalHours', width: 12 },
      { header: 'Overtime Hours', key: 'overtimeHours', width: 12 },
      { header: 'Attendance Rate', key: 'attendanceRate', width: 15 }
    ];
    
    reportData.userReports.forEach(report => {
      detailsSheet.addRow({
        employeeId: report.user.employeeId || '-',
        name: report.user.name,
        department: report.user.department,
        presentDays: report.summary.presentDays,
        absentDays: report.summary.absentDays,
        lateDays: report.summary.lateDays,
        leaveDays: report.summary.leaveDays,
        totalHours: report.summary.totalHours,
        overtimeHours: report.summary.overtimeHours,
        attendanceRate: `${report.summary.attendanceRate}%`
      });
    });
    
    // Daily Details Sheet
    const dailySheet = workbook.addWorksheet('Daily Details');
    const dateHeaders = [];
    const start = dayjs(reportData.period.startDate);
    const end = dayjs(reportData.period.endDate);
    let current = start;
    
    while (current <= end) {
      dateHeaders.push({
        header: current.format('DD-MMM'),
        key: `day_${current.format('YYYY-MM-DD')}`,
        width: 10
      });
      current = current.add(1, 'day');
    }
    
    dailySheet.columns = [
      { header: 'Employee', key: 'employee', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      ...dateHeaders
    ];
    
    reportData.userReports.forEach(report => {
      const row = {
        employee: report.user.name,
        department: report.user.department
      };
      
      report.dailyDetails.forEach(detail => {
        row[`day_${detail.date}`] = this.getStatusSymbol(detail.status);
      });
      
      dailySheet.addRow(row);
    });
    
    // Apply formatting
    [summarySheet, detailsSheet, dailySheet].forEach(sheet => {
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });
    
    return workbook;
  }
  
  /**
   * Get status symbol for daily sheet
   */
  getStatusSymbol(status) {
    const symbols = {
      'present': 'P',
      'absent': 'A',
      'late': 'L',
      'half_day': 'H',
      'on_leave': 'LV',
      'holiday': 'H',
      'week_off': 'WO',
      'holiday_work': 'HW',
      'week_off_work': 'WW'
    };
    
    return symbols[status] || 'A';
  }
  
  /**
   * Generate payroll report
   */
  async generatePayrollReport(organizationId, month, options = {}) {
    const attendanceReport = await this.generateMonthlyReport(organizationId, month, options);
    
    // Calculate payroll (simplified - implement based on your payroll rules)
    const payrollData = attendanceReport.userReports.map(report => {
      const basicSalary = 30000; // Example - get from employee record
      const perDaySalary = basicSalary / 30;
      
      const presentDays = report.summary.presentDays + (report.summary.halfDays * 0.5);
      const payableDays = presentDays + report.summary.leaveDays + report.summary.holidayDays;
      
      const basicPay = perDaySalary * payableDays;
      const overtimePay = report.summary.overtimeHours * 100; // Example rate
      const totalPay = basicPay + overtimePay;
      
      const deductions = report.summary.absentDays * perDaySalary;
      const netPay = totalPay - deductions;
      
      return {
        employee: report.user,
        attendance: report.summary,
        payroll: {
          basicSalary,
          perDaySalary,
          payableDays,
          basicPay,
          overtimePay,
          totalPay,
          deductions,
          netPay
        }
      };
    });
    
    return {
      period: attendanceReport.period,
      payrollData,
      summary: {
        totalBasicPay: payrollData.reduce((sum, item) => sum + item.payroll.basicPay, 0),
        totalOvertimePay: payrollData.reduce((sum, item) => sum + item.payroll.overtimePay, 0),
        totalDeductions: payrollData.reduce((sum, item) => sum + item.payroll.deductions, 0),
        totalNetPay: payrollData.reduce((sum, item) => sum + item.payroll.netPay, 0)
      }
    };
  }
}

module.exports = new ReportService();