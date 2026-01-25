const AttendanceMachine = require('../../models/attendance/attendanceMachine.model');
const AttendanceLog = require('../../models/attendance/attendanceLog.model');
const AttendanceDaily = require('../../models/attendance/attendanceDaily.model');
const User = require('../../../modules/auth/core/user.model');
const Shift = require('../../models/shift.model');
const AppError = require('../../../core/utils/appError');
const dayjs = require('dayjs');
const mongoose = require('mongoose');

class MachineService {
  
  /**
   * Authenticate machine (compatible with your User model)
   */
  async authenticateMachine(apiKey, machineIp) {
    const machine = await AttendanceMachine.findOne({ 
      apiKey,
      status: 'active'
    }).select('+apiKey');
    
    if (!machine) {
      throw new AppError('Unauthorized machine or inactive', 401);
    }
    
    // Optional IP restriction
    if (machine.ipAddress && machine.ipAddress !== machineIp) {
      console.warn(`Machine IP mismatch: ${machineIp} vs ${machine.ipAddress}`);
    }
    
    return machine;
  }
  
  /**
   * Process machine data (updated for your User model)
   */
  async processMachineData(machine, payload) {
    const data = Array.isArray(payload) ? payload : [payload];
    if (data.length === 0) {
      return { synced: 0, processed: 0, orphaned: 0 };
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      let processedCount = 0;
      let orphanedCount = 0;
      const realTimeEvents = [];
      
      for (const entry of data) {
        const machineUserId = entry.userId || entry.user_id || entry.uid;
        const scanTime = new Date(entry.timestamp || entry.time || Date.now());
        const statusType = entry.status || entry.type;
        
        // Validate required fields
        if (!machineUserId || !scanTime || isNaN(scanTime.getTime())) {
          console.warn('Invalid entry:', entry);
          continue;
        }
        
        // Find user by machineUserId in attendanceConfig
        const user = await User.findOne({
          'attendanceConfig.machineUserId': String(machineUserId),
          organizationId: machine.organizationId,
          isActive: true,
          status: 'approved'
        }).session(session);
        
        let processingStatus = 'processed';
        if (!user) {
          processingStatus = 'orphan';
          orphanedCount++;
        }
        
        // Create log
        const logEntry = new AttendanceLog({
          machineId: machine._id,
          rawUserId: machineUserId,
          user: user ? user._id : null,
          organizationId: machine.organizationId,
          branchId: machine.branchId,
          timestamp: scanTime,
          type: this.mapLogType(statusType, machine.providerType),
          source: 'machine',
          processingStatus,
          rawData: entry
        });
        
        await logEntry.save({ session });
        
        // Update daily record if user exists
        if (user) {
          await this.updateDailyAttendance(user, scanTime, logEntry, session);
          processedCount++;
          
          // Prepare real-time event
          realTimeEvents.push({
            userId: user._id,
            userName: user.name,
            type: logEntry.type,
            time: dayjs(scanTime).format('HH:mm'),
            date: dayjs(scanTime).format('YYYY-MM-DD'),
            machine: machine.name,
            logId: logEntry._id
          });
        }
      }
      
      // Update machine sync time
      machine.lastSyncAt = new Date();
      machine.syncCount = (machine.syncCount || 0) + 1;
      await machine.save({ session });
      
      await session.commitTransaction();
      
      // Emit real-time events if any
      if (realTimeEvents.length > 0) {
        await this.emitRealTimeEvents(machine, realTimeEvents);
      }
      
      return {
        synced: data.length,
        processed: processedCount,
        orphaned: orphanedCount
      };
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Update daily attendance with night shift logic
   */
  async updateDailyAttendance(user, scanTime, logEntry, session) {
    let dateStr = dayjs(scanTime).format('YYYY-MM-DD');
    
    // Apply night shift logic if user has shift
    if (user.attendanceConfig?.shiftId) {
      const shift = await Shift.findById(user.attendanceConfig.shiftId).session(session);
      
      if (shift && shift.isNightShift) {
        dateStr = this.adjustDateForNightShift(scanTime, shift);
      }
    }
    
    let daily = await AttendanceDaily.findOne({
      user: user._id,
      date: dateStr
    }).session(session);
    
    if (!daily) {
      daily = new AttendanceDaily({
        user: user._id,
        organizationId: user.organizationId,
        branchId: user.branchId,
        date: dateStr,
        logs: [logEntry._id],
        status: 'present',
        shiftId: user.attendanceConfig?.shiftId || null
      });
      
      // Set shift timings
      if (user.attendanceConfig?.shiftId) {
        const shift = await Shift.findById(user.attendanceConfig.shiftId).session(session);
        if (shift) {
          daily.shiftId = shift._id;
          daily.scheduledInTime = shift.startTime;
          daily.scheduledOutTime = shift.endTime;
        }
      }
      
      if (logEntry.type === 'in') {
        daily.firstIn = scanTime;
      }
    } else {
      daily.logs.push(logEntry._id);
      
      // Update first in if earlier
      if (logEntry.type === 'in' && (!daily.firstIn || scanTime < daily.firstIn)) {
        daily.firstIn = scanTime;
      }
      
      // Update last out if later
      if (logEntry.type === 'out' && (!daily.lastOut || scanTime > daily.lastOut)) {
        daily.lastOut = scanTime;
      }
    }
    
    // Calculate hours and check rules
    if (daily.firstIn && daily.lastOut) {
      const diffMs = daily.lastOut - daily.firstIn;
      daily.totalWorkHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
      
      // Check overtime
      if (daily.shiftId) {
        const shift = await Shift.findById(daily.shiftId).session(session);
        if (shift) {
          const shiftHours = shift.minFullDayHrs || 8;
          if (daily.totalWorkHours > shiftHours) {
            daily.overtimeHours = daily.totalWorkHours - shiftHours;
            daily.isOvertime = true;
          }
          
          // Check half day
          if (daily.totalWorkHours < (shift.halfDayThresholdHrs || 4)) {
            daily.isHalfDay = true;
            daily.status = 'half_day';
          }
          
          // Check late arrival
          if (daily.scheduledInTime) {
            const [scheduledHour, scheduledMinute] = daily.scheduledInTime.split(':').map(Number);
            const scheduledTime = new Date(daily.firstIn);
            scheduledTime.setHours(scheduledHour, scheduledMinute, 0, 0);
            
            const graceMs = (shift.gracePeriodMins || 15) * 60 * 1000;
            daily.isLate = daily.firstIn > new Date(scheduledTime.getTime() + graceMs);
          }
        }
      }
    }
    
    await daily.save({ session });
  }
  
  /**
   * Adjust date for night shift
   */
  adjustDateForNightShift(scanTime, shift) {
    const punchHour = scanTime.getHours();
    const [endHour] = shift.endTime.split(':').map(Number);
    const cutoffHour = endHour + 4; // 4 hours buffer
    
    if (punchHour <= cutoffHour) {
      return dayjs(scanTime).subtract(1, 'day').format('YYYY-MM-DD');
    }
    
    return dayjs(scanTime).format('YYYY-MM-DD');
  }
  
  /**
   * Map machine status codes
   */
  mapLogType(status, providerType = 'generic') {
    const statusStr = String(status).toLowerCase();
    
    const mappings = {
      zkteco: {
        '0': 'in', '1': 'out', 'checkin': 'in', 'checkout': 'out'
      },
      hikvision: {
        'in': 'in', 'out': 'out', 'enter': 'in', 'exit': 'out'
      },
      essl: {
        '0': 'in', '1': 'out', '2': 'break_start', '3': 'break_end'
      },
      generic: {
        '0': 'in', '1': 'out', '2': 'break_start', '3': 'break_end',
        'in': 'in', 'out': 'out', 'checkin': 'in', 'checkout': 'out'
      }
    };
    
    const providerMap = mappings[providerType] || mappings.generic;
    return providerMap[statusStr] || 'unknown';
  }
  
  /**
   * Create new machine
   */
  async createMachine(data, userId) {
    // Get user to get organization info
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    
    // Check for duplicate serial number
    const existing = await AttendanceMachine.findOne({
      serialNumber: data.serialNumber,
      organizationId: user.organizationId
    });
    
    if (existing) {
      throw new AppError('Machine with this serial number already exists', 400);
    }
    
    // Generate API key
    const apiKey = this.generateApiKey();
    
    const machine = await AttendanceMachine.create({
      ...data,
      organizationId: user.organizationId,
      branchId: data.branchId || user.branchId,
      apiKey,
      installedBy: userId,
      installedAt: new Date()
    });
    
    // Remove API key from response
    const machineObj = machine.toObject();
    delete machineObj.apiKey;
    
    return {
      machine: machineObj,
      apiKey // Return API key only once
    };
  }
  
  /**
   * Generate API key
   */
  generateApiKey() {
    return `mch_${require('crypto').randomBytes(32).toString('hex')}`;
  }
  
  /**
   * Emit real-time events
   */
  async emitRealTimeEvents(machine, events) {
    // Implement your real-time notification logic
    // This could be WebSocket, Socket.io, Pusher, etc.
    
    console.log(`Machine ${machine.name} processed ${events.length} events`);
    
    // Example with Socket.io
    if (global.io) {
      events.forEach(event => {
        global.io.to(`user_${event.userId}`).emit('attendance:punch', {
          type: event.type,
          time: event.time,
          machine: event.machine
        });
      });
      
      // Notify managers
      const managers = await User.find({
        organizationId: machine.organizationId,
        role: { $in: ['admin', 'manager'] },
        isActive: true
      }).select('_id');
      
      managers.forEach(manager => {
        global.io.to(`user_${manager._id}`).emit('attendance:machine_update', {
          machineId: machine._id,
          machineName: machine.name,
          eventsCount: events.length
        });
      });
    }
  }
}

module.exports = new MachineService();

// const AttendanceMachine = require('../../models/attendance/attendanceMachine.model');
// const AttendanceLog = require('../../models/attendance/attendanceLog.model');
// const AttendanceDaily = require('../../models/attendance/attendanceDaily.model');
// const User = require('../../../modules/auth/core/user.model');
// const Shift = require('../../models/shift.model');
// const AppError = require('../../../core/utils/appError');
// const dayjs = require('dayjs');
// const mongoose = require('mongoose');

// class MachineService {
  
//   /**
//    * Authenticate machine
//    */
//   async authenticateMachine(apiKey, machineIp) {
//     const machine = await AttendanceMachine.findOne({ 
//       apiKey,
//       status: 'active'
//     }).select('+apiKey');
    
//     if (!machine) {
//       throw new AppError('Unauthorized machine', 401);
//     }
    
//     // Optional IP restriction
//     if (machine.ipAddress && machine.ipAddress !== machineIp) {
//       console.warn(`Machine IP mismatch: ${machineIp} vs ${machine.ipAddress}`);
//     }
    
//     return machine;
//   }
  
//   /**
//    * Process machine data
//    */
//   async processMachineData(machine, payload) {
//     const data = Array.isArray(payload) ? payload : [payload];
//     if (data.length === 0) {
//       return { synced: 0, processed: 0, orphaned: 0 };
//     }
    
//     const session = await mongoose.startSession();
//     session.startTransaction();
    
//     try {
//       let processedCount = 0;
//       let orphanedCount = 0;
      
//       for (const entry of data) {
//         const machineUserId = entry.userId || entry.user_id || entry.uid;
//         const scanTime = new Date(entry.timestamp || entry.time || Date.now());
//         const statusType = entry.status || entry.type;
        
//         // Validate required fields
//         if (!machineUserId || !scanTime || isNaN(scanTime.getTime())) {
//           console.warn('Invalid entry:', entry);
//           continue;
//         }
        
//         // Find user
//         const user = await User.findOne({
//           'attendanceConfig.machineUserId': String(machineUserId),
//           organizationId: machine.organizationId,
//           status: 'active'
//         }).session(session);
        
//         let processingStatus = 'processed';
//         if (!user) {
//           processingStatus = 'orphan';
//           orphanedCount++;
//         }
        
//         // Create log
//         const logEntry = new AttendanceLog({
//           machineId: machine._id,
//           rawUserId: machineUserId,
//           user: user ? user._id : null,
//           organizationId: machine.organizationId,
//           branchId: machine.branchId,
//           timestamp: scanTime,
//           type: this.mapLogType(statusType, machine.providerType),
//           source: 'machine',
//           processingStatus,
//           rawData: entry
//         });
        
//         await logEntry.save({ session });
        
//         // Update daily record if user exists
//         if (user) {
//           await this.updateDailyAttendance(user, scanTime, logEntry, session);
//           processedCount++;
//         }
//       }
      
//       // Update machine sync time
//       machine.lastSyncAt = new Date();
//       await machine.save({ session });
      
//       await session.commitTransaction();
      
//       return {
//         synced: data.length,
//         processed: processedCount,
//         orphaned: orphanedCount
//       };
      
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }
  
//   /**
//    * Update daily attendance record
//    */
//   async updateDailyAttendance(user, scanTime, logEntry, session) {
//     const dateStr = dayjs(scanTime).format('YYYY-MM-DD');
    
//     let daily = await AttendanceDaily.findOne({
//       user: user._id,
//       date: dateStr
//     }).session(session);
    
//     if (!daily) {
//       daily = new AttendanceDaily({
//         user: user._id,
//         organizationId: user.organizationId,
//         branchId: user.branchId,
//         date: dateStr,
//         logs: [logEntry._id],
//         status: 'present'
//       });
      
//       // Get user's shift
//       if (user.shiftId) {
//         const shift = await Shift.findById(user.shiftId).session(session);
//         if (shift) {
//           daily.shiftId = shift._id;
//           daily.scheduledInTime = shift.startTime;
//           daily.scheduledOutTime = shift.endTime;
//         }
//       }
      
//       // Set first punch
//       if (logEntry.type === 'in') {
//         daily.firstIn = scanTime;
//       }
//     } else {
//       daily.logs.push(logEntry._id);
      
//       // Update first in if earlier
//       if (logEntry.type === 'in' && (!daily.firstIn || scanTime < daily.firstIn)) {
//         daily.firstIn = scanTime;
//       }
      
//       // Update last out if later
//       if (logEntry.type === 'out' && (!daily.lastOut || scanTime > daily.lastOut)) {
//         daily.lastOut = scanTime;
//       }
//     }
    
//     // Calculate hours if both in and out exist
//     if (daily.firstIn && daily.lastOut) {
//       const diffMs = daily.lastOut - daily.firstIn;
//       daily.totalWorkHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
      
//       // Check overtime
//       const shift = await Shift.findById(daily.shiftId).session(session);
//       if (shift) {
//         const shiftHours = shift.minFullDayHrs || 8;
//         if (daily.totalWorkHours > shiftHours) {
//           daily.overtimeHours = daily.totalWorkHours - shiftHours;
//           daily.isOvertime = true;
//         }
        
//         // Check half day
//         if (daily.totalWorkHours < (shift.halfDayThresholdHrs || 4)) {
//           daily.isHalfDay = true;
//           daily.status = 'half_day';
//         }
//       }
//     }
    
//     await daily.save({ session });
//   }
  
//   /**
//    * Map machine status codes to system types
//    */
//   mapLogType(status, providerType = 'generic') {
//     const statusStr = String(status).toLowerCase();
    
//     const mappings = {
//       zkteco: {
//         '0': 'in', '1': 'out', 'checkin': 'in', 'checkout': 'out'
//       },
//       hikvision: {
//         'in': 'in', 'out': 'out', 'enter': 'in', 'exit': 'out'
//       },
//       essl: {
//         '0': 'in', '1': 'out', '2': 'break_start', '3': 'break_end'
//       },
//       generic: {
//         '0': 'in', '1': 'out', '2': 'break_start', '3': 'break_end',
//         'in': 'in', 'out': 'out', 'checkin': 'in', 'checkout': 'out'
//       }
//     };
    
//     const providerMap = mappings[providerType] || mappings.generic;
//     return providerMap[statusStr] || 'unknown';
//   }
  
//   /**
//    * Create new machine
//    */
//   async createMachine(data) {
//     // Check for duplicate serial number
//     const existing = await AttendanceMachine.findOne({
//       serialNumber: data.serialNumber,
//       organizationId: data.organizationId
//     });
    
//     if (existing) {
//       throw new AppError('Machine with this serial number already exists', 400);
//     }
    
//     // Generate API key
//     const apiKey = this.generateApiKey();
//     data.apiKey = apiKey;
    
//     const machine = await AttendanceMachine.create(data);
    
//     // Remove API key from response
//     const machineObj = machine.toObject();
//     delete machineObj.apiKey;
    
//     return {
//       machine: machineObj,
//       apiKey // Return API key only once
//     };
//   }
  
//   /**
//    * Generate API key
//    */
//   generateApiKey() {
//     return `att_${require('crypto').randomBytes(32).toString('hex')}`;
//   }
// }

// module.exports = new MachineService();