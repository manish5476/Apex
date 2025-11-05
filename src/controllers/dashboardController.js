const dashboardService = require('../services/dashboardService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

/* ==========================================================
   Controller: Get Dashboard Data
   ----------------------------------------------------------
   Calls the service and sends JSON response
========================================================== */
exports.getDashboardOverview = catchAsync(async (req, res, next) => {
  const { organizationId, branchId } = req.user;

  if (!organizationId) {
    return next(new AppError('Organization context missing', 400));
  }

  const data = await dashboardService.getDashboardData(organizationId, branchId);

  res.status(200).json({
    status: 'success',
    message: 'Dashboard data fetched successfully',
    data,
  });
});
