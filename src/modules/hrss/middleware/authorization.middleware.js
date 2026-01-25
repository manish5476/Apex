const AppError = require('../../core/utils/appError');
const catchAsync = require('../../core/utils/catchAsync');

/**
 * Restrict access based on role (updated for your User model)
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // Check if user has role or is super admin
    if (req.user.isSuperAdmin) {
      return next();
    }
    
    // Check if user is owner
    if (req.user.isOwner) {
      return next();
    }
    
    // Check role from Role model (if you have role-based permissions)
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    
    next();
  };
};

/**
 * Check if user can access attendance data
 */
exports.canAccessAttendance = catchAsync(async (req, res, next) => {
  const user = req.user;
  const targetUserId = req.params.userId || req.query.userId;
  
  // Users can always access their own data
  if (!targetUserId || targetUserId === 'me' || targetUserId === user._id.toString()) {
    return next();
  }
  
  // Check permissions based on role and reporting structure
  const canAccess = await checkAttendanceAccess(user, targetUserId);
  
  if (!canAccess) {
    return next(new AppError('You do not have permission to access this attendance data', 403));
  }
  
  next();
});

/**
 * Check if user can manage attendance requests
 */
exports.canManageRequests = catchAsync(async (req, res, next) => {
  const user = req.user;
  const requestId = req.params.id;
  
  // For new requests, user can always create
  if (!requestId) {
    return next();
  }
  
  // Check if user owns the request or has permission to manage
  const AttendanceRequest = require('../models/attendance/attendanceRequest.model');
  const request = await AttendanceRequest.findById(requestId);
  
  if (!request) {
    return next(new AppError('Request not found', 404));
  }
  
  const canManage = await checkRequestPermission(user, request);
  
  if (!canManage) {
    return next(new AppError('You do not have permission to manage this request', 403));
  }
  
  next();
});

/**
 * Check if user can manage team data (for managers)
 */
exports.canManageTeam = catchAsync(async (req, res, next) => {
  const user = req.user;
  
  // Check if user is a manager or has reportingManager field
  const User = require('../../../modules/auth/core/user.model');
  const hasTeam = await User.countDocuments({ reportingManager: user._id });
  
  if (!hasTeam && !['admin', 'owner', 'hr'].includes(user.role)) {
    return next(new AppError('You do not have any team members to manage', 403));
  }
  
  next();
});

/**
 * Check if user can view reports
 */
exports.canViewReports = catchAsync(async (req, res, next) => {
  const user = req.user;
  
  // All active users can view their own reports
  if (!req.query.department && !req.query.branchId && !req.query.userId) {
    return next();
  }
  
  // Check for broader access based on role
  const allowedRoles = ['admin', 'owner', 'hr', 'manager'];
  
  if (!allowedRoles.includes(user.role) && !user.isSuperAdmin) {
    return next(new AppError('You do not have permission to view organization reports', 403));
  }
  
  next();
});

/**
 * Check if user can manage machines
 */
exports.canManageMachines = catchAsync(async (req, res, next) => {
  const user = req.user;
  
  // Only admin, owner, and super admin can manage machines
  if (!['admin', 'owner'].includes(user.role) && !user.isSuperAdmin) {
    return next(new AppError('You do not have permission to manage machines', 403));
  }
  
  next();
});

/**
 * Check team access for managers
 */
exports.checkTeamAccess = catchAsync(async (req, res, next) => {
  const user = req.user;
  
  // Skip if user is admin/owner/hr
  if (['admin', 'owner', 'hr'].includes(user.role) || user.isSuperAdmin) {
    return next();
  }
  
  const targetUserId = req.params.userId || req.query.userId;
  
  if (targetUserId) {
    const User = require('../../../modules/auth/core/user.model');
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      return next(new AppError('User not found', 404));
    }
    
    // Check if target user is in manager's team
    const isInTeam = await checkTeamMembership(user._id, targetUser._id);
    
    if (!isInTeam) {
      return next(new AppError('You can only access data for your team members', 403));
    }
  }
  
  next();
});

/**
 * Helper: Check attendance access permission
 */
async function checkAttendanceAccess(user, targetUserId) {
  // Super admin can access everything
  if (user.isSuperAdmin) {
    return true;
  }
  
  // Admin/Owner can access everything in their organization
  if (['admin', 'owner'].includes(user.role)) {
    const User = require('../../../modules/auth/core/user.model');
    const targetUser = await User.findById(targetUserId);
    return targetUser && targetUser.organizationId.toString() === user.organizationId.toString();
  }
  
  // HR can access everything in their organization
  if (user.role === 'hr') {
    const User = require('../../../modules/auth/core/user.model');
    const targetUser = await User.findById(targetUserId);
    return targetUser && targetUser.organizationId.toString() === user.organizationId.toString();
  }
  
  // Managers can access their team
  if (user.role === 'manager' || user.reportingManager) {
    return await checkTeamMembership(user._id, targetUserId);
  }
  
  return false;
}

/**
 * Helper: Check team membership
 */
async function checkTeamMembership(managerId, userId) {
  const User = require('../../../modules/auth/core/user.model');
  
  // Check direct report
  const directReport = await User.findOne({
    _id: userId,
    reportingManager: managerId,
    isActive: true
  });
  
  if (directReport) {
    return true;
  }
  
  // Check indirect reports (team hierarchy)
  const getAllTeamMembers = async (managerId) => {
    const directMembers = await User.find({ 
      reportingManager: managerId,
      isActive: true 
    }).select('_id');
    
    let allMembers = [...directMembers];
    
    for (const member of directMembers) {
      const subMembers = await getAllTeamMembers(member._id);
      allMembers = [...allMembers, ...subMembers];
    }
    
    return allMembers;
  };
  
  const teamMembers = await getAllTeamMembers(managerId);
  return teamMembers.some(member => member._id.toString() === userId.toString());
}

/**
 * Helper: Check request permission
 */
async function checkRequestPermission(user, request) {
  // User owns the request
  if (request.user.toString() === user._id.toString()) {
    return true;
  }
  
  // User is an approver
  const isApprover = request.approvers.some(
    approver => approver.user.toString() === user._id.toString()
  );
  
  if (isApprover) {
    return true;
  }
  
  // Super admin can manage all requests
  if (user.isSuperAdmin) {
    return true;
  }
  
  // Admin/Owner/HR can manage all requests in organization
  if (['admin', 'owner', 'hr'].includes(user.role)) {
    return request.organizationId.toString() === user.organizationId.toString();
  }
  
  // Manager can manage requests for their team
  if (user.role === 'manager' || user.reportingManager) {
    const isInTeam = await checkTeamMembership(user._id, request.user);
    return isInTeam;
  }
  
  return false;
}

// const AppError = require('../../core/utils/appError');
// const catchAsync = require('../../core/utils/catchAsync');

// /**
//  * Restrict access based on role
//  */
// exports.restrictTo = (...roles) => {
//   return (req, res, next) => {
//     if (!roles.includes(req.user.role)) {
//       return next(new AppError('You do not have permission to perform this action', 403));
//     }
//     next();
//   };
// };

// /**
//  * Check if user can access attendance data
//  */
// exports.canAccessAttendance = catchAsync(async (req, res, next) => {
//   const user = req.user;
//   const targetUserId = req.params.userId || req.query.userId;
  
//   // Users can always access their own data
//   if (!targetUserId || targetUserId === 'me' || targetUserId === user._id.toString()) {
//     return next();
//   }
  
//   // Check permissions based on role
//   const canAccess = await checkAccessPermission(user, targetUserId);
  
//   if (!canAccess) {
//     return next(new AppError('You do not have permission to access this attendance data', 403));
//   }
  
//   next();
// });

// /**
//  * Check if user can manage attendance requests
//  */
// exports.canManageRequests = catchAsync(async (req, res, next) => {
//   const user = req.user;
//   const requestId = req.params.id;
  
//   // For new requests, user can always create
//   if (!requestId) {
//     return next();
//   }
  
//   // Check if user owns the request or has permission to manage
//   const AttendanceRequest = require('../models/attendance/attendanceRequest.model');
//   const request = await AttendanceRequest.findById(requestId);
  
//   if (!request) {
//     return next(new AppError('Request not found', 404));
//   }
  
//   const canManage = await checkRequestPermission(user, request);
  
//   if (!canManage) {
//     return next(new AppError('You do not have permission to manage this request', 403));
//   }
  
//   next();
// });

// /**
//  * Check if user can manage shifts
//  */
// exports.canManageShifts = catchAsync(async (req, res, next) => {
//   const user = req.user;
  
//   // Only admin, owner, and HR can manage shifts
//   if (!['admin', 'owner', 'hr'].includes(user.role)) {
//     return next(new AppError('You do not have permission to manage shifts', 403));
//   }
  
//   next();
// });

// /**
//  * Check if user can manage holidays
//  */
// exports.canManageHolidays = catchAsync(async (req, res, next) => {
//   const user = req.user;
  
//   // Only admin, owner, and HR can manage holidays
//   if (!['admin', 'owner', 'hr'].includes(user.role)) {
//     return next(new AppError('You do not have permission to manage holidays', 403));
//   }
  
//   next();
// });

// /**
//  * Check if user can manage leaves
//  */
// exports.canManageLeaves = catchAsync(async (req, res, next) => {
//   const user = req.user;
//   const leaveId = req.params.id;
  
//   // For new leaves, user can always create
//   if (!leaveId) {
//     return next();
//   }
  
//   // Check if user owns the leave or has permission to manage
//   const LeaveRequest = require('../models/leave.model');
//   const leave = await LeaveRequest.findById(leaveId);
  
//   if (!leave) {
//     return next(new AppError('Leave not found', 404));
//   }
  
//   const canManage = await checkLeavePermission(user, leave);
  
//   if (!canManage) {
//     return next(new AppError('You do not have permission to manage this leave', 403));
//   }
  
//   next();
// });

// /**
//  * Check if user can view reports
//  */
// exports.canViewReports = catchAsync(async (req, res, next) => {
//   const user = req.user;
  
//   // All roles can view reports, but with different scopes
//   const allowedRoles = ['admin', 'owner', 'hr', 'manager', 'employee'];
  
//   if (!allowedRoles.includes(user.role)) {
//     return next(new AppError('You do not have permission to view reports', 403));
//   }
  
//   next();
// });

// /**
//  * Check if user can export data
//  */
// exports.canExportData = catchAsync(async (req, res, next) => {
//   const user = req.user;
  
//   // Only certain roles can export data
//   if (!['admin', 'owner', 'hr'].includes(user.role)) {
//     return next(new AppError('You do not have permission to export data', 403));
//   }
  
//   next();
// });

// /**
//  * Check if user can manage machines
//  */
// exports.canManageMachines = catchAsync(async (req, res, next) => {
//   const user = req.user;
  
//   // Only admin and owner can manage machines
//   if (!['admin', 'owner'].includes(user.role)) {
//     return next(new AppError('You do not have permission to manage machines', 403));
//   }
  
//   next();
// });

// /**
//  * Check team access for managers
//  */
// exports.checkTeamAccess = catchAsync(async (req, res, next) => {
//   const user = req.user;
  
//   if (user.role !== 'manager') {
//     return next();
//   }
  
//   const targetUserId = req.params.userId || req.query.userId;
  
//   if (targetUserId) {
//     const User = require('../../../modules/auth/core/user.model');
//     const targetUser = await User.findById(targetUserId);
    
//     if (!targetUser) {
//       return next(new AppError('User not found', 404));
//     }
    
//     // Check if target user is in manager's team
//     const isInTeam = await checkTeamMembership(user._id, targetUser._id);
    
//     if (!isInTeam) {
//       return next(new AppError('You can only access data for your team members', 403));
//     }
//   }
  
//   next();
// });

// /**
//  * Helper: Check access permission
//  */
// async function checkAccessPermission(user, targetUserId) {
//   // Admin/Owner can access everything
//   if (['admin', 'owner'].includes(user.role)) {
//     return true;
//   }
  
//   // HR can access everything in their organization
//   if (user.role === 'hr') {
//     const User = require('../../../modules/auth/core/user.model');
//     const targetUser = await User.findById(targetUserId);
//     return targetUser && targetUser.organizationId.toString() === user.organizationId.toString();
//   }
  
//   // Managers can access their team
//   if (user.role === 'manager') {
//     return await checkTeamMembership(user._id, targetUserId);
//   }
  
//   return false;
// }

// /**
//  * Helper: Check team membership
//  */
// async function checkTeamMembership(managerId, userId) {
//   const User = require('../../../modules/auth/core/user.model');
  
//   // Direct reports
//   const directReport = await User.findOne({
//     _id: userId,
//     manager: managerId
//   });
  
//   if (directReport) {
//     return true;
//   }
  
//   // Check indirect reports (team hierarchy)
//   const getAllTeamMembers = async (managerId) => {
//     const directMembers = await User.find({ manager: managerId }).select('_id');
//     let allMembers = [...directMembers];
    
//     for (const member of directMembers) {
//       const subMembers = await getAllTeamMembers(member._id);
//       allMembers = [...allMembers, ...subMembers];
//     }
    
//     return allMembers;
//   };
  
//   const teamMembers = await getAllTeamMembers(managerId);
//   return teamMembers.some(member => member._id.toString() === userId.toString());
// }

// /**
//  * Helper: Check request permission
//  */
// async function checkRequestPermission(user, request) {
//   // User owns the request
//   if (request.user.toString() === user._id.toString()) {
//     return true;
//   }
  
//   // User is an approver
//   const isApprover = request.approvers.some(
//     approver => approver.user.toString() === user._id.toString()
//   );
  
//   if (isApprover) {
//     return true;
//   }
  
//   // Admin/Owner/HR can manage all requests
//   if (['admin', 'owner', 'hr'].includes(user.role)) {
//     return true;
//   }
  
//   // Manager can manage requests for their team
//   if (user.role === 'manager') {
//     const isInTeam = await checkTeamMembership(user._id, request.user);
//     return isInTeam;
//   }
  
//   return false;
// }

// /**
//  * Helper: Check leave permission
//  */
// async function checkLeavePermission(user, leave) {
//   // User owns the leave
//   if (leave.user.toString() === user._id.toString()) {
//     return true;
//   }
  
//   // User is an approver
//   const isApprover = leave.approvers.some(
//     approver => approver.user && approver.user.toString() === user._id.toString()
//   );
  
//   if (isApprover) {
//     return true;
//   }
  
//   // Admin/Owner/HR can manage all leaves
//   if (['admin', 'owner', 'hr'].includes(user.role)) {
//     return true;
//   }
  
//   // Manager can manage leaves for their team
//   if (user.role === 'manager') {
//     const isInTeam = await checkTeamMembership(user._id, leave.user);
//     return isInTeam;
//   }
  
//   return false;
// }