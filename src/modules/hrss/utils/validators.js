const dayjs = require('dayjs');

class Validators {
  
  /**
   * Validate date string (YYYY-MM-DD)
   */
  static validateDate(dateStr) {
    if (!dateStr) return { isValid: false, error: 'Date is required' };
    
    if (!dayjs(dateStr, 'YYYY-MM-DD', true).isValid()) {
      return { isValid: false, error: 'Invalid date format. Use YYYY-MM-DD' };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validate time string (HH:mm)
   */
  static validateTime(timeStr) {
    if (!timeStr) return { isValid: false, error: 'Time is required' };
    
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(timeStr)) {
      return { isValid: false, error: 'Invalid time format. Use HH:mm' };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validate date range
   */
  static validateDateRange(startDate, endDate) {
    const startValidation = this.validateDate(startDate);
    const endValidation = this.validateDate(endDate);
    
    if (!startValidation.isValid) return startValidation;
    if (!endValidation.isValid) return endValidation;
    
    if (dayjs(startDate).isAfter(dayjs(endDate))) {
      return { 
        isValid: false, 
        error: 'Start date cannot be after end date' 
      };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validate email
   */
  static validateEmail(email) {
    if (!email) return { isValid: false, error: 'Email is required' };
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { isValid: false, error: 'Invalid email format' };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validate phone number
   */
  static validatePhone(phone) {
    if (!phone) return { isValid: true }; // Phone is optional
    
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone.replace(/\D/g, ''))) {
      return { isValid: false, error: 'Invalid phone number. Use 10 digits' };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validate employee ID
   */
  static validateEmployeeId(empId) {
    if (!empId) return { isValid: true }; // Optional
    
    // Alphanumeric, 3-20 characters
    const empIdRegex = /^[A-Za-z0-9]{3,20}$/;
    if (!empIdRegex.test(empId)) {
      return { 
        isValid: false, 
        error: 'Employee ID must be 3-20 alphanumeric characters' 
      };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validate coordinates
   */
  static validateCoordinates(lat, lng) {
    if (lat === undefined || lng === undefined) {
      return { isValid: true }; // Optional
    }
    
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return { isValid: false, error: 'Coordinates must be numbers' };
    }
    
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { isValid: false, error: 'Coordinates out of range' };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validate file upload
   */
  static validateFile(file, options = {}) {
    const {
      maxSize = 5 * 1024 * 1024, // 5MB default
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
      required = false
    } = options;
    
    if (!file && required) {
      return { isValid: false, error: 'File is required' };
    }
    
    if (!file) {
      return { isValid: true };
    }
    
    if (file.size > maxSize) {
      return { 
        isValid: false, 
        error: `File size exceeds ${maxSize / (1024 * 1024)}MB limit` 
      };
    }
    
    if (!allowedTypes.includes(file.mimetype)) {
      return { 
        isValid: false, 
        error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}` 
      };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validate password strength
   */
  static validatePassword(password) {
    if (!password) return { isValid: false, error: 'Password is required' };
    
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    const errors = [];
    
    if (password.length < minLength) {
      errors.push(`At least ${minLength} characters`);
    }
    if (!hasUpperCase) {
      errors.push('At least one uppercase letter');
    }
    if (!hasLowerCase) {
      errors.push('At least one lowercase letter');
    }
    if (!hasNumbers) {
      errors.push('At least one number');
    }
    if (!hasSpecialChar) {
      errors.push('At least one special character');
    }
    
    if (errors.length > 0) {
      return { 
        isValid: false, 
        error: `Password must contain: ${errors.join(', ')}` 
      };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validate leave request
   */
  static validateLeaveRequest(data) {
    const { startDate, endDate, leaveType, reason } = data;
    
    // Validate required fields
    if (!startDate || !endDate || !leaveType || !reason) {
      return { isValid: false, error: 'All fields are required' };
    }
    
    // Validate date range
    const dateValidation = this.validateDateRange(startDate, endDate);
    if (!dateValidation.isValid) {
      return dateValidation;
    }
    
    // Validate reason length
    if (reason.length < 10) {
      return { isValid: false, error: 'Reason must be at least 10 characters' };
    }
    
    // Validate leave type
    const validLeaveTypes = ['casual', 'sick', 'earned', 'maternity', 'paternity', 'bereavement', 'unpaid'];
    if (!validLeaveTypes.includes(leaveType)) {
      return { 
        isValid: false, 
        error: `Invalid leave type. Valid types: ${validLeaveTypes.join(', ')}` 
      };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validate attendance request
   */
  static validateAttendanceRequest(data) {
    const { targetDate, type, correction } = data;
    
    // Validate required fields
    if (!targetDate || !type) {
      return { isValid: false, error: 'Target date and type are required' };
    }
    
    // Validate date
    const dateValidation = this.validateDate(targetDate);
    if (!dateValidation.isValid) {
      return dateValidation;
    }
    
    // Validate request type
    const validTypes = ['missed_punch', 'correction', 'work_from_home', 'on_duty', 'leave_reversal'];
    if (!validTypes.includes(type)) {
      return { 
        isValid: false, 
        error: `Invalid request type. Valid types: ${validTypes.join(', ')}` 
      };
    }
    
    // Validate correction data if provided
    if (correction) {
      if (!correction.reason || correction.reason.length < 10) {
        return { 
          isValid: false, 
          error: 'Correction reason must be at least 10 characters' 
        };
      }
      
      // Validate new times if provided
      if (correction.newFirstIn && !this.isValidDateObject(correction.newFirstIn)) {
        return { isValid: false, error: 'Invalid new first in time' };
      }
      
      if (correction.newLastOut && !this.isValidDateObject(correction.newLastOut)) {
        return { isValid: false, error: 'Invalid new last out time' };
      }
    }
    
    return { isValid: true };
  }
  
  /**
   * Validate shift data
   */
  static validateShift(data) {
    const { name, startTime, endTime } = data;
    
    if (!name || !startTime || !endTime) {
      return { isValid: false, error: 'Name, start time, and end time are required' };
    }
    
    const startValidation = this.validateTime(startTime);
    const endValidation = this.validateTime(endTime);
    
    if (!startValidation.isValid) return startValidation;
    if (!endValidation.isValid) return endValidation;
    
    // Validate name length
    if (name.length < 2 || name.length > 50) {
      return { 
        isValid: false, 
        error: 'Name must be between 2 and 50 characters' 
      };
    }
    
    return { isValid: true };
  }
  
  /**
   * Helper: Check if value is valid Date object
   */
  static isValidDateObject(date) {
    return date instanceof Date && !isNaN(date.getTime());
  }
  
  /**
   * Sanitize input string
   */
  static sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    return str
      .replace(/[<>]/g, '') // Remove HTML tags
      .trim()
      .substring(0, 1000); // Limit length
  }
  
  /**
   * Sanitize object recursively
   */
  static sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}

module.exports = Validators;