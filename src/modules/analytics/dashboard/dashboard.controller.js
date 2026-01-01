const dashboardService = require('../services/dashboardService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// in src/controllers/dashboardController.js
const SalesService = require('../services/salesService');

async function dashboardSummary(req, res, next) {
  // existing computations
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const salesAgg = await SalesService.aggregateTotal({ createdAt: { $gte: lastMonth } });

  // include monthly totals
  const monthly = await require('../models/salesModel').aggregateMonthlyTotals(
    new Date(new Date().getFullYear(), 0, 1),
    new Date()
  );

  res.json({
    success: true,
    invoicesSummary,
    paymentsSummary,
    salesSummary: salesAgg,
    salesMonthly: monthly
  });
}


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

