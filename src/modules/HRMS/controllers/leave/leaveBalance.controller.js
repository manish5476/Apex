// controllers/leave/leaveBalance.controller.js
const mongoose = require('mongoose');
const LeaveBalance = require('../../models/leaveBalance.model');
const LeaveRequest = require('../../models/leaveRequest.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError = require('../../../../core/utils/api/appError');
const factory = require('../../../../core/utils/api/handlerFactory');

// ======================================================
// HELPERS & UTILITIES
// ======================================================

const getFinancialYear = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const getFinancialYearDates = (financialYear) => {
  const [startYear, endYear] = financialYear.split('-').map(Number);
  return {
    startDate: new Date(startYear, 3, 1), // April 1st
    endDate: new Date(endYear, 2, 31, 23, 59, 59) // March 31st next year
  };
};

const calculateAccruedLeave = (user, financialYear, balance) => {
  const joinDate = user.employeeProfile?.dateOfJoining;
  if (!joinDate) return 0;
  
  const { startDate } = getFinancialYearDates(financialYear);
  const effectiveStart = joinDate > startDate ? joinDate : startDate;
  
  if (effectiveStart > new Date()) return 0;
  
  const monthsWorked = Math.floor(
    (new Date() - effectiveStart) / (1000 * 60 * 60 * 24 * 30)
  );
  
  // Example: 1.5 days earned leave per month
  return Math.min(monthsWorked * 1.5, 18); // Max 18 days
};

// ======================================================
// CRUD OPERATIONS
// ======================================================

/**
 * @desc    Get all leave balances
 * @route   GET /api/v1/leave-balances
 * @access  Private (Admin/HR)
 */
exports.getAllLeaveBalances = factory.getAll(LeaveBalance, {
  searchFields: ['financialYear'],
  populate: [
    { path: 'user', select: 'name employeeProfile.employeeId employeeProfile.departmentId' }
  ],
  sort: { financialYear: -1, 'user.name': 1 }
});

/**
 * @desc    Get single leave balance
 * @route   GET /api/v1/leave-balances/:id
 * @access  Private
 */
exports.getLeaveBalance = factory.getOne(LeaveBalance, {
  populate: [
    { path: 'user', select: 'name employeeProfile employeeProfile.dateOfJoining email phone' },
    { path: 'transactions.referenceId', select: 'leaveRequestId leaveType status' }
  ]
});

/**
 * @desc    Get my leave balance
 * @route   GET /api/v1/leave-balances/my-balance
 * @access  Private
 */
exports.getMyLeaveBalance = catchAsync(async (req, res, next) => {
  const { financialYear = getFinancialYear() } = req.query;
  
  let balance = await LeaveBalance.findOne({
    user: req.user._id,
    organizationId: req.user.organizationId,
    financialYear
  }).populate('transactions.referenceId', 'leaveRequestId status');
  
  // If balance doesn't exist for this year, initialize it
  if (!balance) {
    balance = await initializeLeaveBalance(req.user._id, req.user.organizationId, financialYear, req.user);
  }
  
  // Calculate projected balance for future months
  const projected = {};
  const leaveTypes = ['casualLeave', 'sickLeave', 'earnedLeave'];
  
  for (const type of leaveTypes) {
    const available = balance[type].total - balance[type].used;
    const pendingLeaves = await LeaveRequest.aggregate([
      {
        $match: {
          user: req.user._id,
          organizationId: req.user.organizationId,
          leaveType: type.replace('Leave', ''),
          status: 'pending',
          startDate: { $gte: new Date() }
        }
      },
      {
        $group: {
          _id: null,
          totalDays: { $sum: '$daysCount' }
        }
      }
    ]);
    
    projected[type] = {
      available,
      pending: pendingLeaves[0]?.totalDays || 0,
      netAvailable: available - (pendingLeaves[0]?.totalDays || 0)
    };
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      financialYear,
      balance,
      projected,
      summary: {
        totalLeaves: balance.casualLeave.total + balance.sickLeave.total + balance.earnedLeave.total,
        totalUsed: balance.casualLeave.used + balance.sickLeave.used + balance.earnedLeave.used,
        totalAvailable: (balance.casualLeave.total - balance.casualLeave.used) +
                       (balance.sickLeave.total - balance.sickLeave.used) +
                       (balance.earnedLeave.total - balance.earnedLeave.used)
      },
      recentTransactions: balance.transactions.slice(-10)
    }
  });
});

/**
 * @desc    Update leave balance (Admin only)
 * @route   PATCH /api/v1/leave-balances/:id
 * @access  Private (Admin/HR)
 */
exports.updateLeaveBalance = catchAsync(async (req, res, next) => {
  const balance = await LeaveBalance.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!balance) {
    return next(new AppError('Leave balance not found', 404));
  }
  
  // Only allow specific fields to be updated
  const allowedUpdates = ['casualLeave', 'sickLeave', 'earnedLeave', 'compensatoryOff'];
  const updates = {};
  
  for (const field of allowedUpdates) {
    if (req.body[field]) {
      // Validate totals don't go negative
      if (req.body[field].total < 0 || req.body[field].used < 0) {
        return next(new AppError(`${field} values cannot be negative`, 400));
      }
      
      if (req.body[field].used > req.body[field].total) {
        return next(new AppError(`Used ${field} cannot exceed total`, 400));
      }
      
      updates[field] = req.body[field];
    }
  }
  
  // Add transaction record
  balance.transactions.push({
    leaveType: 'adjustment',
    changeType: 'adjusted',
    amount: 0, // Manual adjustment
    runningBalance: balance.casualLeave.total - balance.casualLeave.used,
    description: req.body.reason || 'Manual adjustment by admin',
    processedBy: req.user._id
  });
  
  Object.assign(balance, updates);
  balance.updatedBy = req.user._id;
  await balance.save();
  
  res.status(200).json({
    status: 'success',
    data: { leaveBalance: balance }
  });
});

// ======================================================
// LEAVE ACCRUAL & MANAGEMENT
// ======================================================

/**
 * @desc    Initialize leave balance for user
 * @route   POST /api/v1/leave-balances/initialize
 * @access  Private (Admin/HR)
 */
exports.initializeLeaveBalance = catchAsync(async (req, res, next) => {
  const { userId, financialYear = getFinancialYear() } = req.body;
  
  const user = await User.findOne({
    _id: userId,
    organizationId: req.user.organizationId
  });
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  const balance = await initializeLeaveBalance(
    userId, 
    req.user.organizationId, 
    financialYear,
    user
  );
  
  res.status(201).json({
    status: 'success',
    data: { leaveBalance: balance }
  });
});

/**
 * @desc    Bulk initialize leave balances for new financial year
 * @route   POST /api/v1/leave-balances/bulk-initialize
 * @access  Private (Admin/HR)
 */
exports.bulkInitializeLeaveBalances = catchAsync(async (req, res, next) => {
  const { financialYear = getFinancialYear(), carryForward = true } = req.body;
  
  // Get all active users
  const users = await User.find({
    organizationId: req.user.organizationId,
    isActive: true,
    status: 'approved'
  }).select('_id employeeProfile.dateOfJoining');
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const results = {
      initialized: [],
      skipped: [],
      errors: []
    };
    
    for (const user of users) {
      try {
        // Check if balance already exists
        const existing = await LeaveBalance.findOne({
          user: user._id,
          organizationId: req.user.organizationId,
          financialYear
        }).session(session);
        
        if (existing) {
          results.skipped.push({ userId: user._id, reason: 'Already exists' });
          continue;
        }
        
        let previousBalance = null;
        
        // Carry forward from previous year
        if (carryForward) {
          const [startYear] = financialYear.split('-');
          const previousYear = `${parseInt(startYear) - 1}-${startYear}`;
          
          previousBalance = await LeaveBalance.findOne({
            user: user._id,
            organizationId: req.user.organizationId,
            financialYear: previousYear
          }).session(session);
        }
        
        // Calculate opening balances
        const openingBalance = {
          casualLeave: previousBalance ? 
            Math.min(previousBalance.casualLeave.total - previousBalance.casualLeave.used, 15) : // Max carry forward 15
            12, // Default
          sickLeave: previousBalance ?
            Math.min(previousBalance.sickLeave.total - previousBalance.sickLeave.used, 15) :
            10,
          earnedLeave: previousBalance ?
            Math.min(previousBalance.earnedLeave.total - previousBalance.earnedLeave.used, 30) :
            0,
          compensatoryOff: previousBalance?.compensatoryOff?.total - previousBalance?.compensatoryOff?.used || 0
        };
        
        // Create new balance
        const newBalance = await LeaveBalance.create([{
          user: user._id,
          organizationId: req.user.organizationId,
          financialYear,
          openingBalance,
          casualLeave: { total: openingBalance.casualLeave, used: 0 },
          sickLeave: { total: openingBalance.sickLeave, used: 0 },
          earnedLeave: { total: openingBalance.earnedLeave, used: 0 },
          compensatoryOff: { total: openingBalance.compensatoryOff, used: 0 },
          transactions: [{
            leaveType: 'opening',
            changeType: 'carry_forward',
            amount: openingBalance.casualLeave + openingBalance.sickLeave + openingBalance.earnedLeave,
            runningBalance: openingBalance.casualLeave + openingBalance.sickLeave + openingBalance.earnedLeave,
            description: `Opening balance for FY ${financialYear}`,
            processedBy: req.user._id
          }],
          createdBy: req.user._id,
          updatedBy: req.user._id
        }], { session });
        
        results.initialized.push(newBalance[0]);
      } catch (error) {
        results.errors.push({ userId: user._id, error: error.message });
      }
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      data: results
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Accrue leave monthly
 * @route   POST /api/v1/leave-balances/accrue-monthly
 * @access  Private (System/Cron)
 */
exports.accrueMonthlyLeave = catchAsync(async (req, res, next) => {
  // This would typically be called by a cron job
  const { month, year } = req.body;
  const targetDate = new Date(year, month - 1, 1);
  
  // Get all active users who joined before this month
  const users = await User.find({
    organizationId: req.user.organizationId,
    isActive: true,
    'employeeProfile.dateOfJoining': { $lte: targetDate }
  });
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const results = [];
    
    for (const user of users) {
      const financialYear = getFinancialYear(targetDate);
      const balance = await LeaveBalance.findOne({
        user: user._id,
        organizationId: req.user.organizationId,
        financialYear
      }).session(session);
      
      if (balance) {
        // Calculate accrual based on policy
        const accrualRate = balance.accrualRate?.earnedLeavePerMonth || 1.5;
        
        // Don't accrue beyond maximum
        const maxEarnedLeave = 30; // Configurable
        const currentEarned = balance.earnedLeave.total;
        
        if (currentEarned < maxEarnedLeave) {
          const toAccrue = Math.min(accrualRate, maxEarnedLeave - currentEarned);
          
          balance.earnedLeave.total += toAccrue;
          balance.lastAccruedAt = new Date();
          
          balance.transactions.push({
            leaveType: 'earned',
            changeType: 'credited',
            amount: toAccrue,
            runningBalance: balance.earnedLeave.total - balance.earnedLeave.used,
            description: `Monthly accrual for ${month}/${year}`,
            processedBy: req.user._id
          });
          
          await balance.save({ session });
          results.push({ user: user._id, accrued: toAccrue });
        }
      }
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      data: {
        month,
        year,
        usersProcessed: results.length,
        results
      }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// ======================================================
// REPORTING & ANALYTICS
// ======================================================

/**
 * @desc    Get leave balance report
 * @route   GET /api/v1/leave-balances/report
 * @access  Private (Admin/HR)
 */
exports.getLeaveBalanceReport = catchAsync(async (req, res, next) => {
  const { financialYear = getFinancialYear(), departmentId } = req.query;
  
  const matchStage = {
    organizationId: req.user.organizationId,
    financialYear
  };
  
  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userInfo'
      }
    },
    { $unwind: '$userInfo' },
    {
      $match: {
        'userInfo.isActive': true,
        'userInfo.status': 'approved'
      }
    }
  ];
  
  // Filter by department
  if (departmentId) {
    pipeline.push({
      $match: {
        'userInfo.employeeProfile.departmentId': mongoose.Types.ObjectId(departmentId)
      }
    });
  }
  
  pipeline.push({
    $project: {
      userId: '$userInfo._id',
      employeeName: '$userInfo.name',
      employeeId: '$userInfo.employeeProfile.employeeId',
      department: '$userInfo.employeeProfile.departmentId',
      designation: '$userInfo.employeeProfile.designationId',
      dateOfJoining: '$userInfo.employeeProfile.dateOfJoining',
      casualLeave: {
        total: '$casualLeave.total',
        used: '$casualLeave.used',
        available: { $subtract: ['$casualLeave.total', '$casualLeave.used'] }
      },
      sickLeave: {
        total: '$sickLeave.total',
        used: '$sickLeave.used',
        available: { $subtract: ['$sickLeave.total', '$sickLeave.used'] }
      },
      earnedLeave: {
        total: '$earnedLeave.total',
        used: '$earnedLeave.used',
        available: { $subtract: ['$earnedLeave.total', '$earnedLeave.used'] }
      },
      totalAvailable: {
        $add: [
          { $subtract: ['$casualLeave.total', '$casualLeave.used'] },
          { $subtract: ['$sickLeave.total', '$sickLeave.used'] },
          { $subtract: ['$earnedLeave.total', '$earnedLeave.used'] }
        ]
      }
    }
  });
  
  // Get department names
  pipeline.push({
    $lookup: {
      from: 'departments',
      localField: 'department',
      foreignField: '_id',
      as: 'deptInfo'
    }
  });
  
  pipeline.push({
    $addFields: {
      departmentName: { $arrayElemAt: ['$deptInfo.name', 0] }
    }
  });
  
  // Get designation titles
  pipeline.push({
    $lookup: {
      from: 'designations',
      localField: 'designation',
      foreignField: '_id',
      as: 'desigInfo'
    }
  });
  
  pipeline.push({
    $addFields: {
      designationTitle: { $arrayElemAt: ['$desigInfo.title', 0] }
    }
  });
  
  pipeline.push({
    $sort: { departmentName: 1, employeeName: 1 }
  });
  
  const report = await LeaveBalance.aggregate(pipeline);
  
  // Calculate summary statistics
  const summary = {
    totalEmployees: report.length,
    totalLeaveBalance: report.reduce((sum, emp) => sum + emp.totalAvailable, 0),
    averagePerEmployee: report.length ? 
      report.reduce((sum, emp) => sum + emp.totalAvailable, 0) / report.length : 0,
    byLeaveType: {
      casual: report.reduce((sum, emp) => sum + emp.casualLeave.available, 0),
      sick: report.reduce((sum, emp) => sum + emp.sickLeave.available, 0),
      earned: report.reduce((sum, emp) => sum + emp.earnedLeave.available, 0)
    }
  };
  
  res.status(200).json({
    status: 'success',
    data: {
      financialYear,
      summary,
      report
    }
  });
});

/**
 * @desc    Get leave utilization trends
 * @route   GET /api/v1/leave-balances/utilization-trends
 * @access  Private (Admin/HR)
 */
exports.getUtilizationTrends = catchAsync(async (req, res, next) => {
  const { years = 2 } = req.query;
  
  const currentYear = new Date().getFullYear();
  const financialYears = [];
  
  for (let i = 0; i < years; i++) {
    const year = currentYear - i;
    financialYears.push(`${year - 1}-${year}`);
  }
  
  const trends = await LeaveBalance.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        financialYear: { $in: financialYears }
      }
    },
    {
      $group: {
        _id: '$financialYear',
        totalCasual: { $sum: '$casualLeave.used' },
        totalSick: { $sum: '$sickLeave.used' },
        totalEarned: { $sum: '$earnedLeave.used' },
        employeeCount: { $sum: 1 },
        avgCasual: { $avg: '$casualLeave.used' },
        avgSick: { $avg: '$sickLeave.used' },
        avgEarned: { $avg: '$earnedLeave.used' }
      }
    },
    { $sort: { '_id': -1 } }
  ]);
  
  // Get monthly breakdown for current year
  const currentFY = getFinancialYear();
  const { startDate, endDate } = getFinancialYearDates(currentFY);
  
  const monthlyUsage = await LeaveRequest.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        status: 'approved',
        startDate: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: { $month: '$startDate' },
        count: { $sum: 1 },
        days: { $sum: '$daysCount' }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
  
  res.status(200).json({
    status: 'success',
    data: {
      yearlyTrends: trends,
      monthlyUsage: monthlyUsage.map(m => ({
        month: m._id,
        requests: m.count,
        days: m.days
      }))
    }
  });
});

// ======================================================
// HELPER FUNCTIONS
// ======================================================

const initializeLeaveBalance = async (userId, organizationId, financialYear, user) => {
  const joinDate = user.employeeProfile?.dateOfJoining;
  const { startDate } = getFinancialYearDates(financialYear);
  
  // Calculate pro-rated leaves if joined mid-year
  let casualTotal = 12;
  let sickTotal = 10;
  let earnedTotal = 0;
  
  if (joinDate && joinDate > startDate) {
    const monthsRemaining = Math.ceil(
      (new Date(financialYear.split('-')[1], 2, 31) - joinDate) / (1000 * 60 * 60 * 24 * 30)
    );
    const totalMonths = 12;
    
    casualTotal = Math.round((12 / totalMonths) * monthsRemaining);
    sickTotal = Math.round((10 / totalMonths) * monthsRemaining);
  }
  
  const balance = await LeaveBalance.create({
    user: userId,
    organizationId,
    financialYear,
    openingBalance: {
      casualLeave: casualTotal,
      sickLeave: sickTotal,
      earnedLeave: 0
    },
    casualLeave: { total: casualTotal, used: 0 },
    sickLeave: { total: sickTotal, used: 0 },
    earnedLeave: { total: earnedTotal, used: 0 },
    transactions: [{
      leaveType: 'opening',
      changeType: 'credited',
      amount: casualTotal + sickTotal,
      runningBalance: casualTotal + sickTotal,
      description: `Opening balance for FY ${financialYear}`,
      processedBy: userId
    }],
    createdBy: userId,
    updatedBy: userId
  });
  
  return balance;
};