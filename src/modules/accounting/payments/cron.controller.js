// src/modules/accounting/payments/controllers/cron.controller.js
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
exports.getCronStatus = catchAsync(async (req, res) => {
  if (!global.PaymentCronManager) {
    throw new AppError('Payment Cron Manager not initialized', 500);
  }
  
  const status = global.PaymentCronManager.getJobStatus();
  
  res.status(200).json({
    status: 'success',
    data: {
      jobs: status,
      totalJobs: Object.keys(status).length,
      managerActive: true
    }
  });
});

exports.triggerCronJob = catchAsync(async (req, res) => {
  const { job } = req.params;
  
  // Admin check
  if (!req.user.roles.includes('admin')) {
    throw new AppError('Unauthorized - Admin only', 403);
  }
  
  if (!global.PaymentCronManager) {
    throw new AppError('Payment Cron Manager not initialized', 500);
  }
  
  const result = await global.PaymentCronManager.runJobManually(job);
  
  res.status(200).json({
    status: 'success',
    data: result
  });
});

exports.stopCronJobs = catchAsync(async (req, res) => {
  if (!req.user.roles.includes('admin')) {
    throw new AppError('Unauthorized - Admin only', 403);
  }
  
  if (!global.PaymentCronManager) {
    throw new AppError('Payment Cron Manager not initialized', 500);
  }
  
  global.PaymentCronManager.stopAllJobs();
  
  res.status(200).json({
    status: 'success',
    message: 'Payment cron jobs stopped'
  });
});