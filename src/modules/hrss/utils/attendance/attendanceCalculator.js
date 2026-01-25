const dayjs = require('dayjs');

class AttendanceCalculator {
  
  /**
   * Calculate work hours between two timestamps
   */
  static calculateWorkHours(startTime, endTime, breaks = []) {
    if (!startTime || !endTime) return 0;
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    // Basic work hours in decimal
    let totalHours = (end - start) / (1000 * 60 * 60);
    
    // Subtract break hours
    if (breaks.length > 0) {
      const breakHours = breaks.reduce((total, breakItem) => {
        return total + (breakItem.duration || 0);
      }, 0) / 60; // Convert minutes to hours
      
      totalHours -= breakHours;
    }
    
    return Math.max(0, totalHours); // Ensure non-negative
  }
  
  /**
   * Calculate overtime hours
   */
  static calculateOvertime(workHours, shiftHours, overtimeRules = {}) {
    const {
      dailyThreshold = 9,
      multiplier = 1.5,
      nightMultiplier = 2.0
    } = overtimeRules;
    
    const threshold = shiftHours || dailyThreshold;
    
    if (workHours <= threshold) {
      return 0;
    }
    
    return workHours - threshold;
  }
  
  /**
   * Calculate late minutes
   */
  static calculateLateMinutes(punchTime, scheduledTime, graceMinutes = 15) {
    if (!punchTime || !scheduledTime) return 0;
    
    const punch = new Date(punchTime);
    const scheduled = new Date(scheduledTime);
    
    // Add grace period
    const graceEnd = new Date(scheduled.getTime() + graceMinutes * 60 * 1000);
    
    if (punch <= graceEnd) {
      return 0;
    }
    
    return Math.max(0, (punch - graceEnd) / (1000 * 60)); // Minutes late
  }
  
  /**
   * Determine attendance status
   */
  static determineStatus(workHours, shift, punches = []) {
    if (!shift) return 'absent';
    
    const { halfDayThresholdHrs = 4, minFullDayHrs = 8 } = shift;
    
    if (workHours <= 0) {
      return 'absent';
    } else if (workHours < halfDayThresholdHrs) {
      return 'half_day';
    } else if (workHours < minFullDayHrs) {
      return 'present';
    } else {
      return 'present';
    }
  }
  
  /**
   * Calculate night shift adjustments
   */
  static adjustForNightShift(date, shift) {
    if (!shift || !shift.isNightShift) {
      return date;
    }
    
    const punchTime = new Date(date);
    const punchHour = punchTime.getHours();
    
    // Parse shift end time
    const [endHour] = shift.endTime.split(':').map(Number);
    
    // If punch is between 00:00 and (shift end + 4 hours), it belongs to previous day
    const cutoffHour = endHour + 4;
    
    if (punchHour <= cutoffHour) {
      return dayjs(date).subtract(1, 'day').toDate();
    }
    
    return date;
  }
  
  /**
   * Calculate break hours from logs
   */
  static calculateBreakHours(logs = []) {
    let breakHours = 0;
    let breakStart = null;
    
    // Sort logs by timestamp
    const sortedLogs = [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    for (const log of sortedLogs) {
      if (log.type === 'break_start') {
        breakStart = new Date(log.timestamp);
      } else if (log.type === 'break_end' && breakStart) {
        const breakEnd = new Date(log.timestamp);
        const breakDuration = (breakEnd - breakStart) / (1000 * 60 * 60); // Hours
        breakHours += breakDuration;
        breakStart = null;
      }
    }
    
    // If break started but never ended, don't count it
    return breakHours;
  }
  
  /**
   * Validate punch sequence
   */
  static validatePunchSequence(currentType, lastPunch) {
    if (!lastPunch) {
      // First punch of the day can be 'in' or 'break_end' (if continuing from previous break)
      return currentType === 'in' || currentType === 'break_end';
    }
    
    const validTransitions = {
      'in': ['out', 'break_start'],
      'out': ['in'],
      'break_start': ['break_end'],
      'break_end': ['in', 'break_start'],
      'remote_in': ['remote_out', 'break_start'],
      'remote_out': ['remote_in']
    };
    
    const allowedNext = validTransitions[lastPunch.type] || [];
    return allowedNext.includes(currentType);
  }
  
  /**
   * Calculate attendance rate
   */
  static calculateAttendanceRate(presentDays, workingDays) {
    if (workingDays === 0) return 0;
    return (presentDays / workingDays) * 100;
  }
  
  /**
   * Calculate productivity score
   */
  static calculateProductivityScore(attendanceRate, punctualityScore, overtimeRatio) {
    // Weights can be adjusted based on organization policy
    const weights = {
      attendance: 0.4,
      punctuality: 0.4,
      overtime: 0.2
    };
    
    // Normalize overtime ratio (0-100%)
    const normalizedOvertime = Math.min(overtimeRatio * 100, 100);
    
    return (
      (attendanceRate * weights.attendance) +
      (punctualityScore * weights.punctuality) +
      (normalizedOvertime * weights.overtime)
    );
  }
  
  /**
   * Generate attendance pattern
   */
  static analyzePattern(attendanceRecords, period = 30) {
    const patterns = {
      latePatterns: {},
      absentPatterns: {},
      preferredPunchTimes: {
        in: [],
        out: []
      }
    };
    
    // Analyze last N days
    const recentRecords = attendanceRecords.slice(0, period);
    
    // Find late patterns by day of week
    recentRecords.forEach(record => {
      if (record.isLate && record.firstIn) {
        const dayOfWeek = new Date(record.firstIn).getDay();
        patterns.latePatterns[dayOfWeek] = (patterns.latePatterns[dayOfWeek] || 0) + 1;
      }
      
      if (record.status === 'absent') {
        const date = new Date(record.date);
        const dayOfWeek = date.getDay();
        patterns.absentPatterns[dayOfWeek] = (patterns.absentPatterns[dayOfWeek] || 0) + 1;
      }
      
      // Track punch times
      if (record.firstIn) {
        const hour = new Date(record.firstIn).getHours();
        patterns.preferredPunchTimes.in[hour] = (patterns.preferredPunchTimes.in[hour] || 0) + 1;
      }
      
      if (record.lastOut) {
        const hour = new Date(record.lastOut).getHours();
        patterns.preferredPunchTimes.out[hour] = (patterns.preferredPunchTimes.out[hour] || 0) + 1;
      }
    });
    
    // Calculate most frequent patterns
    patterns.mostFrequentLateDay = Object.keys(patterns.latePatterns)
      .reduce((a, b) => patterns.latePatterns[a] > patterns.latePatterns[b] ? a : b, null);
    
    patterns.mostFrequentAbsentDay = Object.keys(patterns.absentPatterns)
      .reduce((a, b) => patterns.absentPatterns[a] > patterns.absentPatterns[b] ? a : b, null);
    
    patterns.avgPunchInTime = this.calculateAverageTime(patterns.preferredPunchTimes.in);
    patterns.avgPunchOutTime = this.calculateAverageTime(patterns.preferredPunchTimes.out);
    
    return patterns;
  }
  
  /**
   * Helper: Calculate average time from hour distribution
   */
  static calculateAverageTime(hourDistribution) {
    const total = Object.values(hourDistribution).reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    
    const weightedSum = Object.entries(hourDistribution)
      .reduce((sum, [hour, count]) => sum + (parseInt(hour) * count), 0);
    
    const avgHour = weightedSum / total;
    const hour = Math.floor(avgHour);
    const minute = Math.round((avgHour - hour) * 60);
    
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }
}

module.exports = AttendanceCalculator;