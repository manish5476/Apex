// HR Module
module.exports = {
    // Attendance
    AttendanceDaily: require('./attendance/models/attendanceDaily.model'),
    AttendanceRequest: require('./attendance/models/attendanceRequest.model'),
    
    // Controllers
    attendanceController: require('./attendance/attendance.controller'),
    holidayController: require('./holiday/holiday.controller')
};
