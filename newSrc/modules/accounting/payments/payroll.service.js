// src/services/payrollService.js

exports.calculateMonthlySalary = async (userId, monthStr) => {
    // 1. Get Base Salary
    const user = await User.findById(userId); // e.g., 30,000 per month
    const perDaySalary = user.salary / 30;    // 1,000 per day

    // 2. Aggregate Attendance Days
    const attendance = await AttendanceDaily.find({ 
        user: userId, 
        date: { $regex: `^${monthStr}` } 
    });

    // 3. Sum the "Payable Days"
    // Normal Day = 1.0
    // Holiday = 1.0
    // Holiday Work = 2.0 (Double Pay)
    // Absent = 0.0
    
    const totalPayableDays = attendance.reduce((sum, day) => sum + day.payoutMultiplier, 0);

    // 4. Final Amount
    const totalSalary = totalPayableDays * perDaySalary;
    
    return {
        base: user.salary,
        payableDays: totalPayableDays,
        finalAmount: Math.round(totalSalary)
    };
};
