'use strict';

const mongoose = require('mongoose');
const Invoice = require('../invoice.model');
const Product = require('../../../inventory/core/model/product.model');
const ProfitCalculator = require('../utils/profitCalculator');
const AppError = require('../../../../core/utils/api/appError');
const catchAsync = require('../../../../core/utils/api/catchAsync');
const { getPeriodDates } = require('../../../../core/utils/helpers/date.utils');

// ─────────────────────────────────────────────
//  Internal helper: chunk-based Promise.all
//  Prevents unbounded parallel DB calls
// ─────────────────────────────────────────────
async function processInChunks(arr, fn, size = 20) {
  const results = [];
  for (let i = 0; i < arr.length; i += size) {
    const chunk = await Promise.all(arr.slice(i, i + size).map(fn));
    results.push(...chunk);
  }
  return results;
}

/* ============================================================
   1. PROFIT SUMMARY
   FIX: Was broken — $first:'$grandTotal' after $unwind gives wrong
   revenue. Now uses calculateAdvancedProfit (correct pipeline).
   ============================================================ */
exports.profitSummary = catchAsync(async (req, res, next) => {
  const { startDate, endDate, branchId } = req.query;

  const filters = {
    organizationId: req.user.organizationId,
    startDate,
    endDate,
    branchId: branchId && branchId !== 'all' ? branchId : undefined,
    status: ['issued', 'paid'],
  };

  const { summary, productAnalysis } = await ProfitCalculator.calculateAdvancedProfit(filters);

  res.status(200).json({
    status: 'success',
    data: {
      financials: {
        totalRevenue: summary.totalRevenue,
        totalCost: summary.totalCost,
        totalProfit: summary.grossProfit,
        profitMargin: summary.profitMargin,
        markup: summary.markup,
      },
      metrics: {
        totalInvoices: summary.totalInvoices,
        uniqueProducts: productAnalysis.length,
        totalItems: summary.totalQuantity,
        averageRevenuePerInvoice: summary.averageRevenuePerInvoice,
        averageProfitPerInvoice: summary.averageProfitPerInvoice,
      },
      period: { start: startDate || 'Beginning', end: endDate || 'Now' },
    },
  });
});

/* ============================================================
   2. GET PROFIT ANALYSIS
   FIX: Was loading all invoices into Node.js memory.
   Now uses pure aggregation pipeline via ProfitCalculator.
   ============================================================ */
exports.getProfitAnalysis = catchAsync(async (req, res, next) => {
  const { startDate, endDate, groupBy = 'day', detailed = 'false', branchId } = req.query;

  const filters = {
    organizationId: req.user.organizationId,
    startDate, endDate,
    branchId: branchId && branchId !== 'all' ? branchId : undefined,
    status: ['issued', 'paid'],
  };

  // All aggregation-based — no memory load
  const [profitData, timeAnalysis, customerData, categoryData] = await Promise.all([
    ProfitCalculator.calculateAdvancedProfit(filters),
    ProfitCalculator.getProfitByPeriod(req.user.organizationId, startDate, endDate, groupBy),
    ProfitCalculator.getCustomerProfitability(req.user.organizationId, filters, 5),
    ProfitCalculator.getCategoryProfitability(req.user.organizationId, filters),
  ]);

  const topProducts = profitData.productAnalysis.filter(p => p.grossProfit > 0).slice(0, 10);
  const worstProducts = profitData.productAnalysis.filter(p => p.grossProfit <= 0).slice(0, 10);

  const response = {
    summary: { ...profitData.summary, timePeriod: { start: startDate || 'Beginning', end: endDate || 'Now' } },
    timeAnalysis,
    productAnalysis: {
      totalProducts: profitData.productAnalysis.length,
      topPerforming: topProducts,
      worstPerforming: worstProducts,
      averageProfitMargin: profitData.productAnalysis.length > 0
        ? profitData.productAnalysis.reduce((s, p) => s + (p.profitMargin || 0), 0) / profitData.productAnalysis.length
        : 0,
    },
    customerAnalysis: customerData,
    categoryAnalysis: categoryData,
  };

  if (detailed === 'true') {
    const { limit = 50, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const match = ProfitCalculator.buildProfitQuery(filters);

    const invoices = await Invoice.find(match)
      .select('+items.purchasePriceAtSale')
      .populate({ path: 'items.productId', select: 'name purchasePrice sku' })
      .populate('customerId', 'name')
      .populate('branchId', 'name')
      .sort({ invoiceDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    response.detailedInvoices = await processInChunks(invoices, async inv => {
      const profit = await ProfitCalculator.calculateInvoiceProfit(inv);
      return {
        invoiceId: inv._id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        customerName: inv.customerId?.name || 'Unknown',
        branchName: inv.branchId?.name || 'Unknown',
        paymentStatus: inv.paymentStatus,
        ...profit,
      };
    });
  }

  res.status(200).json({ status: 'success', data: response });
});

/* ============================================================
   3. PRODUCT-SPECIFIC PROFIT ANALYSIS
   FIX: Uses aggregation pipeline — no memory load
   ============================================================ */
exports.getProductProfitAnalysis = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { startDate, endDate } = req.query;

  if (!productId) return next(new AppError('productId is required', 400));

  const match = ProfitCalculator.buildProfitQuery({
    organizationId: req.user.organizationId,
    startDate, endDate,
    productId,
    status: ['issued', 'paid'],
  });

  const result = await Invoice.aggregate([
    { $match: match },
    { $unwind: '$items' },
    { $match: { 'items.productId': new mongoose.Types.ObjectId(productId) } },
    { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'productDoc' } },
    { $addFields: { productDoc: { $arrayElemAt: ['$productDoc', 0] } } },
    {
      $addFields: {
        costPerUnit: { $ifNull: ['$items.purchasePriceAtSale', { $ifNull: ['$productDoc.purchasePrice', 0] }] },
        itemRevenue: { $multiply: ['$items.price', '$items.quantity'] },
      },
    },
    {
      $group: {
        _id: { month: { $dateToString: { format: '%Y-%m', date: '$invoiceDate' } } },
        revenue: { $sum: '$itemRevenue' },
        cost: { $sum: { $multiply: ['$costPerUnit', '$items.quantity'] } },
        quantity: { $sum: '$items.quantity' },
        invoiceCount: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0, month: '$_id.month',
        revenue: { $round: ['$revenue', 2] },
        cost: { $round: ['$cost', 2] },
        profit: { $round: [{ $subtract: ['$revenue', '$cost'] }, 2] },
        quantity: 1, invoiceCount: 1,
      },
    },
    { $sort: { month: 1 } },
  ]);

  const totals = result.reduce(
    (acc, r) => { acc.revenue += r.revenue; acc.cost += r.cost; acc.profit += r.profit; acc.quantity += r.quantity; return acc; },
    { revenue: 0, cost: 0, profit: 0, quantity: 0 }
  );

  const product = await Product.findById(productId).lean();

  res.status(200).json({
    status: 'success',
    data: {
      product: {
        _id: productId,
        name: product?.name || 'Unknown Product',
        purchasePrice: product?.purchasePrice || 0,
        sellingPrice: product?.sellingPrice || 0,
      },
      summary: {
        totalRevenue: totals.revenue,
        totalCost: totals.cost,
        totalProfit: totals.profit,
        profitMargin: totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0,
        totalQuantity: totals.quantity,
        profitPerUnit: totals.quantity > 0 ? totals.profit / totals.quantity : 0,
        averageSellingPrice: totals.quantity > 0 ? totals.revenue / totals.quantity : 0,
        averageCostPrice: totals.quantity > 0 ? totals.cost / totals.quantity : 0,
      },
      timeAnalysis: result,
    },
  });
});

// /* ============================================================
//    4. ADVANCED PROFIT ANALYSIS
//    FIX: All parallel, comparison period also parallel
//    ============================================================ */
// exports.getAdvancedProfitAnalysis = catchAsync(async (req, res, next) => {
//   const {
//     startDate, endDate, groupBy = 'day',
//     branchId, customerId, status, paymentStatus,
//     minAmount, maxAmount, productId, category, gstType,
//     limit = 50, page = 1,
//     detailed = 'false', includeItems = 'false',
//     compareWith = 'previous_period',
//   } = req.query;

//   const filters = {
//     organizationId: req.user.organizationId,
//     startDate, endDate,
//     branchId: branchId !== 'all' ? branchId : undefined,
//     customerId: customerId !== 'all' ? customerId : undefined,
//     productId: productId !== 'all' ? productId : undefined,
//     category: category !== 'all' ? category : undefined,
//     gstType: gstType !== 'all' ? gstType : undefined,
//     paymentStatus: paymentStatus !== 'all' ? paymentStatus : undefined,
//     status: status ? status.split(',') : undefined,
//     minAmount: minAmount ? parseFloat(minAmount) : undefined,
//     maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
//   };

//   // Build comparison filters
//   let compFilters = null;
//   if (compareWith !== 'none' && startDate && endDate) {
//     compFilters = { ...filters };
//     if (compareWith === 'previous_period') {
//       const days = Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000);
//       compFilters.startDate = new Date(new Date(startDate).getTime() - days * 86400000).toISOString().split('T')[0];
//       compFilters.endDate = new Date(new Date(endDate).getTime() - days * 86400000).toISOString().split('T')[0];
//     } else if (compareWith === 'same_period_last_year') {
//       const s = new Date(startDate); s.setFullYear(s.getFullYear() - 1);
//       const e = new Date(endDate); e.setFullYear(e.getFullYear() - 1);
//       compFilters.startDate = s.toISOString().split('T')[0];
//       compFilters.endDate = e.toISOString().split('T')[0];
//     }
//   }

//   // All parallel
//   const promises = [
//     ProfitCalculator.calculateAdvancedProfit(filters),
//     ProfitCalculator.getProfitTrends(req.user.organizationId, filters, groupBy),
//     ProfitCalculator.getCustomerProfitability(req.user.organizationId, filters, 10),
//     ProfitCalculator.getCategoryProfitability(req.user.organizationId, filters),
//   ];
//   if (compFilters) promises.push(ProfitCalculator.calculateAdvancedProfit(compFilters));

//   const [profitData, trends, customerProfitability, categoryProfitability, previousData] = await Promise.all(promises);

//   let comparisonData = null;
//   if (previousData) {
//     comparisonData = {
//       period: compareWith,
//       summary: previousData.summary,
//       growth: {
//         revenueGrowth: previousData.summary.totalRevenue > 0
//           ? ((profitData.summary.totalRevenue - previousData.summary.totalRevenue) / previousData.summary.totalRevenue) * 100 : 0,
//         profitGrowth: previousData.summary.grossProfit > 0
//           ? ((profitData.summary.grossProfit - previousData.summary.grossProfit) / previousData.summary.grossProfit) * 100 : 0,
//         marginChange: profitData.summary.profitMargin - previousData.summary.profitMargin,
//       },
//     };
//   }

//   const topProducts = profitData.productAnalysis.filter(p => p.grossProfit > 0).slice(0, 10);
//   const worstProducts = profitData.productAnalysis.filter(p => p.grossProfit <= 0).slice(0, 10);

//   const response = {
//     metadata: {
//       filtersApplied: { dateRange: { start: startDate, end: endDate }, branchId, customerId, status, productId },
//       period: { start: startDate || 'Beginning', end: endDate || 'Now', groupBy },
//       pagination: {
//         page: parseInt(page), limit: parseInt(limit),
//         totalInvoices: profitData.summary.totalInvoices,
//         totalPages: Math.ceil(profitData.summary.totalInvoices / parseInt(limit)),
//       },
//     },
//     summary: {
//       financials: {
//         totalRevenue: profitData.summary.totalRevenue,
//         totalCost: profitData.summary.totalCost,
//         totalTax: profitData.summary.totalTax,
//         totalDiscount: profitData.summary.totalDiscount,
//         grossProfit: profitData.summary.grossProfit,
//         netProfit: profitData.summary.netProfit,
//         profitMargin: profitData.summary.profitMargin,
//         markup: profitData.summary.markup,
//       },
//       metrics: {
//         totalInvoices: profitData.summary.totalInvoices,
//         totalItems: profitData.summary.totalQuantity,
//         uniqueProducts: profitData.productAnalysis.length,
//         averageRevenuePerInvoice: profitData.summary.averageRevenuePerInvoice,
//         averageProfitPerInvoice: profitData.summary.averageProfitPerInvoice,
//         averageItemsPerInvoice: profitData.summary.averageItemsPerInvoice,
//       },
//     },
//     trends: {
//       data: trends,
//       summary: trends.length > 0 ? {
//         bestPeriod: trends.reduce((m, d) => d.profit > m.profit ? d : m, trends[0]),
//         worstPeriod: trends.reduce((m, d) => d.profit < m.profit ? d : m, trends[0]),
//         averageDailyProfit: trends.reduce((s, d) => s + d.profit, 0) / trends.length,
//         trendDirection: trends.length > 1
//           ? (trends[trends.length - 1].profit > trends[0].profit ? 'up' : 'down')
//           : 'stable',
//       } : null,
//     },
//     analysis: {
//       productAnalysis: {
//         topPerforming: topProducts,
//         worstPerforming: worstProducts,
//         byCategory: categoryProfitability,
//         summary: {
//           totalProducts: profitData.productAnalysis.length,
//           productsWithProfit: profitData.productAnalysis.filter(p => p.grossProfit > 0).length,
//           productsWithLoss: profitData.productAnalysis.filter(p => p.grossProfit <= 0).length,
//           averageProfitMargin: profitData.productAnalysis.length > 0
//             ? profitData.productAnalysis.reduce((s, p) => s + p.profitMargin, 0) / profitData.productAnalysis.length : 0,
//         },
//       },
//       customerAnalysis: {
//         mostProfitable: customerProfitability,
//         summary: {
//           totalCustomers: customerProfitability.length,
//           customersWithProfit: customerProfitability.filter(c => c.totalProfit > 0).length,
//           averageCustomerValue: customerProfitability.length > 0
//             ? customerProfitability.reduce((s, c) => s + c.totalProfit, 0) / customerProfitability.length : 0,
//         },
//       },
//     },
//     kpis: {
//       grossProfitMargin: profitData.summary.profitMargin,
//       netProfitMargin: profitData.summary.totalRevenue > 0
//         ? (profitData.summary.netProfit / profitData.summary.totalRevenue) * 100 : 0,
//       revenuePerInvoice: profitData.summary.averageRevenuePerInvoice,
//       profitPerInvoice: profitData.summary.averageProfitPerInvoice,
//     },
//     comparison: comparisonData,
//   };

//   if (detailed === 'true') {
//     const skip = (parseInt(page) - 1) * parseInt(limit);
//     const match = ProfitCalculator.buildProfitQuery(filters);
//     const invoices = await Invoice.find(match)
//       .select('+items.purchasePriceAtSale')
//       .populate({ path: 'items.productId', select: 'name purchasePrice sku' })
//       .populate('customerId', 'name email')
//       .populate('branchId', 'name')
//       .skip(skip).limit(parseInt(limit))
//       .sort({ invoiceDate: -1 });

//     response.detailedInvoices = await processInChunks(invoices, async inv => {
//       const profit = await ProfitCalculator.calculateInvoiceProfit(inv, includeItems === 'true');
//       return {
//         invoiceId: inv._id, invoiceNumber: inv.invoiceNumber, invoiceDate: inv.invoiceDate,
//         customer: { id: inv.customerId?._id, name: inv.customerId?.name, email: inv.customerId?.email },
//         branch: inv.branchId?.name, status: inv.status, paymentStatus: inv.paymentStatus,
//         ...profit,
//         items: includeItems === 'true' ? profit.items : undefined,
//       };
//     });
//   }

//   res.status(200).json({ status: 'success', data: response });
// });

/**
 * Build a comparison date window from the current filters.
 *
 * Handles four cases:
 *   A) Both startDate + endDate provided → shift window by period length
 *   B) Only startDate provided           → 30-day window ending the day before startDate
 *   C) Only endDate provided             → 30-day window ending 30 days before endDate
 *   D) Neither provided (all-time)       → previous 30 days vs current 30 days
 *
 * @param {string|undefined} startDate  ISO date string or undefined
 * @param {string|undefined} endDate    ISO date string or undefined
 * @param {'previous_period'|'same_period_last_year'} compareWith
 * @returns {{ startDate: string, endDate: string }}
 */
function buildComparisonDates(startDate, endDate, compareWith) {
  const ONE_DAY_MS = 86_400_000;
  const pad = n => String(n).padStart(2, '0');

  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (compareWith === 'same_period_last_year') {
    const s = startDate ? new Date(startDate) : new Date(Date.now() - 30 * ONE_DAY_MS);
    const e = endDate ? new Date(endDate) : new Date();
    s.setFullYear(s.getFullYear() - 1);
    e.setFullYear(e.getFullYear() - 1);
    return { startDate: toISO(s), endDate: toISO(e) };
  }

  // previous_period
  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const len = Math.max(1, Math.ceil((e - s) / ONE_DAY_MS));
    return {
      startDate: toISO(new Date(s.getTime() - len * ONE_DAY_MS)),
      endDate: toISO(new Date(s.getTime() - ONE_DAY_MS)),
    };
  }

  if (startDate) {
    const s = new Date(startDate);
    return {
      startDate: toISO(new Date(s.getTime() - 30 * ONE_DAY_MS)),
      endDate: toISO(new Date(s.getTime() - ONE_DAY_MS)),
    };
  }

  if (endDate) {
    const e = new Date(endDate);
    return {
      startDate: toISO(new Date(e.getTime() - 60 * ONE_DAY_MS)),
      endDate: toISO(new Date(e.getTime() - 31 * ONE_DAY_MS)),
    };
  }

  // All-time: compare last 30 days vs the 30 days before that
  const now = new Date();
  return {
    startDate: toISO(new Date(now.getTime() - 60 * ONE_DAY_MS)),
    endDate: toISO(new Date(now.getTime() - 31 * ONE_DAY_MS)),
  };
}

/** Round to 2 dp */
const round2 = n => Math.round(n * 100) / 100;

/** Safe percentage growth — returns 0 when denominator is 0 (avoids Infinity/NaN) */
const growthPct = (current, previous) =>
  previous > 0 ? round2(((current - previous) / previous) * 100) : 0;







exports.getAdvancedProfitAnalysis = catchAsync(async (req, res, next) => {
  const {
    startDate, endDate,
    groupBy = 'day',
    branchId, customerId,
    status, paymentStatus,
    minAmount, maxAmount,
    productId, category, gstType,
    limit = 50,
    page = 1,
    detailed = 'false',
    includeItems = 'false',
    compareWith = 'previous_period',
  } = req.query;

  const filters = {
    organizationId: req.user.organizationId,
    startDate,
    endDate,
    branchId: branchId !== 'all' ? branchId : undefined,
    customerId: customerId !== 'all' ? customerId : undefined,
    productId: productId !== 'all' ? productId : undefined,
    category: category !== 'all' ? category : undefined,
    gstType: gstType !== 'all' ? gstType : undefined,
    paymentStatus: paymentStatus !== 'all' ? paymentStatus : undefined,
    status: status ? status.split(',') : undefined,
    minAmount: minAmount ? parseFloat(minAmount) : undefined,
    maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
  };

  // FIX #9: Build comparison filters whenever compareWith is not 'none'.
  //         The old code required both startDate AND endDate — comparison was
  //         silently skipped for all-time or single-bound date filters.
  let compFilters = null;
  if (compareWith !== 'none') {
    const compDates = buildComparisonDates(startDate, endDate, compareWith);
    compFilters = { ...filters, ...compDates };
  }

  // Fire all aggregations in parallel
  const promises = [
    ProfitCalculator.calculateAdvancedProfit(filters),
    ProfitCalculator.getProfitTrends(req.user.organizationId, filters, groupBy),
    ProfitCalculator.getCustomerProfitability(req.user.organizationId, filters, 10),
    ProfitCalculator.getCategoryProfitability(req.user.organizationId, filters),
  ];
  if (compFilters) promises.push(ProfitCalculator.calculateAdvancedProfit(compFilters));

  const [profitData, trends, customerProfitability, categoryProfitability, previousData] =
    await Promise.all(promises);

  // FIX #10 + #11: Guard against undefined previousData; round all growth values.
  let comparisonData = null;
  if (previousData?.summary) {
    const prev = previousData.summary;
    const curr = profitData.summary;
    comparisonData = {
      period: compareWith,
      summary: prev,
      growth: {
        revenueGrowth: growthPct(curr.totalRevenue, prev.totalRevenue),
        profitGrowth: growthPct(curr.grossProfit, prev.grossProfit),
        marginChange: round2(curr.profitMargin - prev.profitMargin),
      },
    };
  }

  const topProducts = profitData.productAnalysis.filter(p => p.grossProfit > 0).slice(0, 10);
  const worstProducts = profitData.productAnalysis.filter(p => p.grossProfit <= 0).slice(0, 10);

  const trendsWithSummary = trends.length > 0
    ? {
      data: trends,
      summary: {
        bestPeriod: trends.reduce((m, d) => d.profit > m.profit ? d : m, trends[0]),
        worstPeriod: trends.reduce((m, d) => d.profit < m.profit ? d : m, trends[0]),
        averageDailyProfit: round2(trends.reduce((s, d) => s + d.profit, 0) / trends.length),
        trendDirection: trends.length > 1
          ? (trends[trends.length - 1].profit > trends[0].profit ? 'up' : 'down')
          : 'stable',
      },
    }
    : { data: [], summary: null };

  const response = {
    metadata: {
      filtersApplied: {
        dateRange: { start: startDate, end: endDate },
        branchId, customerId, status, productId,
      },
      period: {
        start: startDate || 'Beginning',
        end: endDate || 'Now',
        groupBy,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalInvoices: profitData.summary.totalInvoices,
        totalPages: Math.ceil(profitData.summary.totalInvoices / parseInt(limit)),
      },
    },

    summary: {
      financials: {
        totalRevenue: profitData.summary.totalRevenue,
        totalCost: profitData.summary.totalCost,
        totalTax: profitData.summary.totalTax,
        totalDiscount: profitData.summary.totalDiscount,
        grossProfit: profitData.summary.grossProfit,
        netProfit: profitData.summary.netProfit,
        profitMargin: profitData.summary.profitMargin,  // already rounded by calculator
        markup: profitData.summary.markup,
      },
      metrics: {
        totalInvoices: profitData.summary.totalInvoices,
        totalItems: profitData.summary.totalQuantity,
        uniqueProducts: profitData.productAnalysis.length,
        averageRevenuePerInvoice: profitData.summary.averageRevenuePerInvoice,
        averageProfitPerInvoice: profitData.summary.averageProfitPerInvoice,
        averageItemsPerInvoice: profitData.summary.averageItemsPerInvoice,
      },
    },

    trends: trendsWithSummary,

    analysis: {
      productAnalysis: {
        topPerforming: topProducts,
        worstPerforming: worstProducts,
        byCategory: categoryProfitability,
        summary: {
          totalProducts: profitData.productAnalysis.length,
          productsWithProfit: profitData.productAnalysis.filter(p => p.grossProfit > 0).length,
          productsWithLoss: profitData.productAnalysis.filter(p => p.grossProfit <= 0).length,
          averageProfitMargin: profitData.productAnalysis.length > 0
            ? round2(
              profitData.productAnalysis.reduce((s, p) => s + p.profitMargin, 0) /
              profitData.productAnalysis.length,
            )
            : 0,
        },
      },
      customerAnalysis: {
        mostProfitable: customerProfitability,
        summary: {
          totalCustomers: customerProfitability.length,
          customersWithProfit: customerProfitability.filter(c => c.totalProfit > 0).length,
          averageCustomerValue: customerProfitability.length > 0
            ? round2(
              customerProfitability.reduce((s, c) => s + c.totalProfit, 0) /
              customerProfitability.length,
            )
            : 0,
        },
      },
    },

    kpis: {
      grossProfitMargin: profitData.summary.profitMargin,
      netProfitMargin: profitData.summary.totalRevenue > 0
        ? round2((profitData.summary.netProfit / profitData.summary.totalRevenue) * 100)
        : 0,
      revenuePerInvoice: profitData.summary.averageRevenuePerInvoice,
      profitPerInvoice: profitData.summary.averageProfitPerInvoice,
    },

    comparison: comparisonData,
  };

  // Optional: detailed invoice list (paginated)
  if (detailed === 'true') {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const match = ProfitCalculator.buildProfitQuery(filters);

    const invoices = await Invoice
      .find(match)
      .select('+items.purchasePriceAtSale')
      .populate({ path: 'items.productId', select: 'name purchasePrice sku' })
      .populate('customerId', 'name email')
      .populate('branchId', 'name')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ invoiceDate: -1 });

    response.detailedInvoices = await Promise.all(
      invoices.map(async inv => {
        const profit = await ProfitCalculator.calculateInvoiceProfit(inv, includeItems === 'true');
        return {
          invoiceId: inv._id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          customer: {
            id: inv.customerId?._id,
            name: inv.customerId?.name,
            email: inv.customerId?.email,
          },
          branch: inv.branchId?.name,
          status: inv.status,
          paymentStatus: inv.paymentStatus,
          ...profit,
          items: includeItems === 'true' ? profit.items : undefined,
        };
      }),
    );
  }

  res.status(200).json({ status: 'success', data: response });
});

/* ============================================================
   5. PROFIT DASHBOARD
   FIX: All parallel via Promise.all, uses getPeriodDates helper
   ============================================================ */
exports.getProfitDashboard = catchAsync(async (req, res, next) => {
  const { period = 'today', startDate, endDate, branchId, compareWith = 'previous_period' } = req.query;
  const orgId = req.user.organizationId;

  const { startDate: periodStart, endDate: periodEnd } = getPeriodDates(period, startDate, endDate);

  const filters = {
    organizationId: orgId,
    startDate: periodStart.toISOString(),
    endDate: periodEnd.toISOString(),
    branchId: branchId && branchId !== 'all' ? branchId : undefined,
  };

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayFilters = { ...filters, startDate: todayStart.toISOString(), endDate: new Date().toISOString() };

  let compFilters = null;
  if (compareWith === 'previous_period') {
    const duration = periodEnd - periodStart;
    compFilters = {
      ...filters,
      startDate: new Date(periodStart.getTime() - duration).toISOString(),
      endDate: new Date(periodStart.getTime() - 1).toISOString(),
    };
  }

  const promises = [
    ProfitCalculator.calculateAdvancedProfit(filters),
    ProfitCalculator.getProfitTrends(orgId, filters, 'day'),
    ProfitCalculator.getCustomerProfitability(orgId, filters, 5),
    ProfitCalculator.getCategoryProfitability(orgId, filters),
    ProfitCalculator.calculateAdvancedProfit(todayFilters),
  ];
  if (compFilters) promises.push(ProfitCalculator.calculateAdvancedProfit(compFilters));

  const [currentData, currentTrends, topCustomers, categoryData, todayData, previousData] = await Promise.all(promises);

  const daysInPeriod = Math.ceil((periodEnd - periodStart) / 86400000) || 1;

  let growth = null;
  if (previousData) {
    const c = currentData.summary, p = previousData.summary;
    growth = {
      revenue: p.totalRevenue > 0 ? ((c.totalRevenue - p.totalRevenue) / p.totalRevenue) * 100 : 0,
      profit: p.grossProfit > 0 ? ((c.grossProfit - p.grossProfit) / p.grossProfit) * 100 : 0,
      margin: c.profitMargin - p.profitMargin,
    };
  }

  res.status(200).json({
    status: 'success',
    data: {
      period: { name: period, start: periodStart, end: periodEnd, days: daysInPeriod },
      overview: {
        today: { revenue: todayData.summary.totalRevenue, profit: todayData.summary.grossProfit, invoices: todayData.summary.totalInvoices },
        period: { ...currentData.summary, averageDailyProfit: currentData.summary.grossProfit / daysInPeriod },
      },
      trends: {
        daily: currentTrends.slice(-7),
        status: currentTrends.length > 1
          ? (currentTrends[currentTrends.length - 1].profit > currentTrends[0].profit ? 'up' : 'down')
          : 'stable',
      },
      topPerformers: {
        products: currentData.productAnalysis.slice(0, 5),
        customers: topCustomers,
        categories: categoryData.slice(0, 3),
      },
      comparison: previousData ? { summary: previousData.summary, growth } : null,
      insights: {
        highMargin: currentData.productAnalysis.filter(p => p.profitMargin > 30).slice(0, 3),
        issues: currentData.productAnalysis.filter(p => p.grossProfit <= 0).slice(0, 3),
      },
    },
  });
});

/* ============================================================
   6. EXPORT PROFIT DATA
   FIX: Chunked processing, hard cap of 500 records
   ============================================================ */
exports.exportProfitData = catchAsync(async (req, res, next) => {
  const {
    format = 'json', startDate, endDate,
    branchId, customerId, productId, category, includeDetails = 'false',
  } = req.query;

  const filters = {
    organizationId: req.user.organizationId,
    startDate, endDate,
    branchId: branchId !== 'all' ? branchId : undefined,
    customerId: customerId !== 'all' ? customerId : undefined,
    productId: productId !== 'all' ? productId : undefined,
    category: category !== 'all' ? category : undefined,
  };

  const profitData = await ProfitCalculator.calculateAdvancedProfit(filters);

  let detailedRows = [];
  if (includeDetails === 'true') {
    const match = ProfitCalculator.buildProfitQuery(filters);
    const invoices = await Invoice.find(match)
      .select('+items.purchasePriceAtSale')
      .populate({ path: 'items.productId', select: 'name purchasePrice sku' })
      .populate('customerId', 'name')
      .populate('branchId', 'name')
      .sort({ invoiceDate: -1 })
      .limit(500); // hard cap

    detailedRows = await processInChunks(invoices, async inv => {
      const profit = await ProfitCalculator.calculateInvoiceProfit(inv);
      return {
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate?.toISOString().split('T')[0],
        customer: inv.customerId?.name || 'Unknown',
        branch: inv.branchId?.name || 'Unknown',
        status: inv.status,
        revenue: profit.revenue,
        cost: profit.cost,
        grossProfit: profit.grossProfit,
        margin: profit.margin,
      };
    });
  }

  let exportData, filename, contentType;

  if (format === 'csv') {
    const rows = [
      ['PROFIT ANALYSIS REPORT'],
      ['Period', `${startDate || 'Beginning'} to ${endDate || 'Now'}`],
      [],
      ['FINANCIAL SUMMARY'],
      ['Total Revenue', profitData.summary.totalRevenue],
      ['Total Cost', profitData.summary.totalCost],
      ['Gross Profit', profitData.summary.grossProfit],
      ['Profit Margin', `${(profitData.summary.profitMargin || 0).toFixed(2)}%`],
      ['Markup', `${(profitData.summary.markup || 0).toFixed(2)}%`],
      [],
      ['TOP 10 PRODUCTS'],
      ['Product Name', 'SKU', 'Quantity', 'Revenue', 'Cost', 'Profit', 'Margin'],
      ...profitData.productAnalysis.slice(0, 10).map(p => [
        p.productName, p.sku || '', p.totalQuantity,
        p.totalRevenue, p.totalCost, p.grossProfit,
        `${(p.profitMargin || 0).toFixed(2)}%`,
      ]),
    ];

    if (detailedRows.length) {
      rows.push([], ['DETAILED INVOICES'],
        ['Invoice Number', 'Date', 'Customer', 'Branch', 'Revenue', 'Cost', 'Profit', 'Margin'],
        ...detailedRows.map(d => [
          d.invoiceNumber, d.invoiceDate, d.customer, d.branch,
          d.revenue, d.cost, d.grossProfit, `${(d.margin || 0).toFixed(2)}%`,
        ])
      );
    }

    exportData = rows.map(r => r.join(',')).join('\n');
    filename = `profit-analysis-${Date.now()}.csv`;
    contentType = 'text/csv';
  } else {
    exportData = JSON.stringify({
      metadata: { exportedAt: new Date().toISOString(), filters },
      summary: profitData.summary,
      productAnalysis: profitData.productAnalysis,
      detailedInvoices: detailedRows,
    }, null, 2);
    filename = `profit-analysis-${Date.now()}.json`;
    contentType = 'application/json';
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(exportData);
});
