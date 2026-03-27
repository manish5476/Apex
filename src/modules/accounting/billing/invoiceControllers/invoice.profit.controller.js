const mongoose = require("mongoose");
const Invoice = require("../invoice.model");
const ProfitCalculator = require('../utils/profitCalculator');

const Product = require("../../../inventory/core/model/product.model");
const { createNotification } = require("../../../notification/core/notification.service");
const salesJournalService = require('../../../inventory/core/service/salesJournal.service');
const AppError = require("../../../../core/utils/api/appError")
const { getPeriodDates } = require('../../../../core/utils/helpers/date.utils');
const catchAsync = require("../../../../core/utils/api/catchAsync");

exports.profitSummary = catchAsync(async (req, res, next) => {
  const { startDate, endDate, branchId } = req.query;

  // 1. Build Match Object
  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true }
  };

  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = new Date(startDate);
    if (endDate) match.invoiceDate.$lte = new Date(endDate);
  }

  if (branchId && branchId !== 'all') {
    match.branchId = branchId;
  }

  // 2. Execute Aggregation Pipeline
  const stats = await Invoice.aggregate([
    { $match: match },
    // Deconstruct the items array to calculate per-item costs
    { $unwind: '$items' },
    // Join with products to get purchase price (if not stored in invoice)
    {
      $lookup: {
        from: 'products', // Ensure this matches your MongoDB collection name
        localField: 'items.productId',
        foreignField: '_id',
        as: 'productInfo'
      }
    },
    { $unwind: '$productInfo' },
    {
      $group: {
        _id: null,
        totalRevenue: { $first: '$grandTotal' }, // This is tricky with unwind, see note below
        totalInvoices: { $addToSet: '$_id' },
        totalCost: {
          $sum: { $multiply: ['$productInfo.purchasePrice', '$items.quantity'] }
        },
        totalQuantity: { $sum: '$items.quantity' },
        uniqueProducts: { $addToSet: '$items.productId' }
      }
    },
    {
      $project: {
        _id: 0,
        totalRevenue: { $sum: '$totalRevenue' }, // Re-summing correctly requires care
        totalInvoices: { $size: '$totalInvoices' },
        totalCost: 1,
        totalQuantity: 1,
        uniqueProducts: { $size: '$uniqueProducts' },
        totalProfit: { $subtract: ['$totalRevenue', '$totalCost'] }
      }
    }
  ]);

  const result = stats[0] || { totalRevenue: 0, totalCost: 0, totalProfit: 0 };

  res.status(200).json({
    status: "success",
    data: result
  });
});

/* ======================================================
   COMPREHENSIVE PROFIT ANALYSIS
====================================================== */
exports.getProfitAnalysis = catchAsync(async (req, res, next) => {
  const {
    startDate,
    endDate,
    groupBy = 'day',
    detailed = 'false',
    branchId
  } = req.query;

  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true }
  };

  // Date filtering
  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = new Date(startDate);
    if (endDate) match.invoiceDate.$lte = new Date(endDate);
  }

  // Branch filtering
  if (branchId && branchId !== 'all') {
    match.branchId = branchId;
  }

  // Get invoices with product details
  const invoices = await Invoice.find(match)
    .populate({
      path: 'items.productId',
      select: 'name purchasePrice'
    })
    .populate('customerId', 'name')
    .populate('branchId', 'name')
    .sort({ invoiceDate: -1 });

  // Calculate profit using utility
  const profitData = await ProfitCalculator.calculateBulkProfit(invoices);

  // Time-based analysis
  const timeAnalysis = await ProfitCalculator.getProfitByPeriod(
    req.user.organizationId,
    startDate,
    endDate,
    groupBy
  );

  // Branch-wise profit (if multi-branch)
  const branchWiseProfit = {};
  if (req.user.branchId) {
    for (const invoice of invoices) {
      const branchName = invoice.branchId?.name || 'Unknown';
      if (!branchWiseProfit[branchName]) {
        branchWiseProfit[branchName] = {
          branchName,
          revenue: 0,
          cost: 0,
          profit: 0,
          invoiceCount: 0
        };
      }

      let invoiceCost = 0;
      for (const item of invoice.items) {
        if (item.productId) {
          const purchasePrice = item.productId.purchasePrice || 0;
          invoiceCost += purchasePrice * item.quantity;
        }
      }

      branchWiseProfit[branchName].revenue += invoice.grandTotal;
      branchWiseProfit[branchName].cost += invoiceCost;
      branchWiseProfit[branchName].profit += (invoice.grandTotal - invoiceCost);
      branchWiseProfit[branchName].invoiceCount += 1;
    }
  }

  // Top performing products
  const topProducts = profitData.productAnalysis
    .filter(p => p.totalProfit > 0)
    .sort((a, b) => b.totalProfit - a.totalProfit)
    .slice(0, 10);

  const worstProducts = profitData.productAnalysis
    .filter(p => p.totalProfit <= 0)
    .sort((a, b) => a.totalProfit - b.totalProfit)
    .slice(0, 10);

  // Response structure
  const response = {
    summary: {
      ...profitData.summary,
      totalInvoices: invoices.length,
      timePeriod: {
        start: startDate || 'Beginning',
        end: endDate || 'Now'
      }
    },
    timeAnalysis,
    productAnalysis: {
      totalProducts: profitData.productAnalysis.length,
      topPerforming: topProducts,
      worstPerforming: worstProducts,
      averageProfitMargin: profitData.productAnalysis.length > 0
        ? profitData.productAnalysis.reduce((sum, p) => sum + (p.profitMargin || 0), 0) / profitData.productAnalysis.length
        : 0
    },
    branchAnalysis: Object.values(branchWiseProfit)
  };

  // Add detailed invoice data if requested
  if (detailed === 'true') {
    const detailedInvoices = await Promise.all(
      invoices.map(async (invoice) => {
        const profit = await ProfitCalculator.calculateInvoiceProfit(invoice);

        return {
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          customerName: invoice.customerId?.name || 'Unknown',
          branchName: invoice.branchId?.name || 'Unknown',
          ...profit,
          paymentStatus: invoice.paymentStatus
        };
      })
    );

    response.detailedInvoices = detailedInvoices;
  }

  res.status(200).json({
    status: 'success',
    data: response
  });
});


/* ======================================================
   PRODUCT-SPECIFIC PROFIT ANALYSIS
====================================================== */
exports.getProductProfitAnalysis = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { startDate, endDate } = req.query;

  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true },
    'items.productId': productId
  };

  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = new Date(startDate);
    if (endDate) match.invoiceDate.$lte = new Date(endDate);
  }

  // Get invoices containing this product
  const invoices = await Invoice.find(match)
    .populate({
      path: 'items.productId',
      match: { _id: productId },
      select: 'name purchasePrice'
    })
    .populate('customerId', 'name')
    .sort({ invoiceDate: -1 });

  // Filter to only get items for this specific product
  const productInvoices = invoices.map(invoice => {
    const productItems = invoice.items.filter(item =>
      item.productId && item.productId._id.toString() === productId
    );

    return {
      ...invoice.toObject(),
      items: productItems
    };
  }).filter(invoice => invoice.items.length > 0);

  // Calculate product-specific profit
  let totalRevenue = 0;
  let totalCost = 0;
  let totalQuantity = 0;
  const salesByMonth = {};
  const salesByCustomer = {};

  for (const invoice of productInvoices) {
    for (const item of invoice.items) {
      if (item.productId && item.productId._id.toString() === productId) {
        const purchasePrice = item.productId.purchasePrice || 0;
        const revenue = item.price * item.quantity;
        const cost = purchasePrice * item.quantity;

        totalRevenue += revenue;
        totalCost += cost;
        totalQuantity += item.quantity;

        // Monthly aggregation
        const invoiceDate = new Date(invoice.invoiceDate);
        const monthKey = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;

        if (!salesByMonth[monthKey]) {
          salesByMonth[monthKey] = {
            month: monthKey,
            revenue: 0,
            cost: 0,
            profit: 0,
            quantity: 0
          };
        }

        salesByMonth[monthKey].revenue += revenue;
        salesByMonth[monthKey].cost += cost;
        salesByMonth[monthKey].profit += (revenue - cost);
        salesByMonth[monthKey].quantity += item.quantity;

        // Customer aggregation
        const customerId = invoice.customerId?._id?.toString() || 'unknown';
        const customerName = invoice.customerId?.name || 'Unknown';

        if (!salesByCustomer[customerId]) {
          salesByCustomer[customerId] = {
            customerId,
            customerName,
            revenue: 0,
            cost: 0,
            profit: 0,
            quantity: 0
          };
        }

        salesByCustomer[customerId].revenue += revenue;
        salesByCustomer[customerId].cost += cost;
        salesByCustomer[customerId].profit += (revenue - cost);
        salesByCustomer[customerId].quantity += item.quantity;
      }
    }
  }

  const totalProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const averageSellingPrice = totalQuantity > 0 ? totalRevenue / totalQuantity : 0;
  const averageCostPrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;
  const profitPerUnit = totalQuantity > 0 ? totalProfit / totalQuantity : 0;

  // Get product details
  const product = await Product.findById(productId).lean();

  res.status(200).json({
    status: 'success',
    data: {
      product: {
        _id: productId,
        name: product?.name || 'Unknown Product',
        purchasePrice: product?.purchasePrice || 0,
        sellingPrice: product?.sellingPrice || 0
      },
      summary: {
        totalRevenue,
        totalCost,
        totalProfit,
        profitMargin,
        totalQuantity,
        averageSellingPrice,
        averageCostPrice,
        profitPerUnit,
        totalInvoices: productInvoices.length
      },
      timeAnalysis: Object.values(salesByMonth).sort((a, b) => a.month.localeCompare(b.month)),
      customerAnalysis: Object.values(salesByCustomer)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10),
      recentSales: productInvoices.slice(0, 10).map(invoice => ({
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        quantity: invoice.items.reduce((sum, item) => sum + item.quantity, 0),
        revenue: invoice.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        profit: invoice.items.reduce((sum, item) => {
          const purchasePrice = item.productId?.purchasePrice || 0;
          return sum + ((item.price - purchasePrice) * item.quantity);
        }, 0)
      }))
    }
  });
});


/* ======================================================
   ADVANCED PROFIT ANALYSIS WITH FILTERS
====================================================== */
exports.getAdvancedProfitAnalysis = catchAsync(async (req, res, next) => {
  const {
    // Date filters
    startDate,
    endDate,

    // Grouping filters
    groupBy = 'day', // hour, day, week, month, quarter, year

    // Location filters
    branchId,

    // Customer filters
    customerId,

    // Status filters
    status, // comma separated: issued,paid
    paymentStatus,

    // Amount filters
    minAmount,
    maxAmount,

    // Product filters
    productId,
    category,

    // Tax filters
    gstType,

    // Pagination & limits
    limit = 50,
    page = 1,

    // Detail level
    detailed = 'false',
    includeItems = 'false',

    // Time comparison
    compareWith = 'previous_period' // previous_period, same_period_last_year, none

  } = req.query;

  // Build filters object
  const filters = {
    organizationId: req.user.organizationId,
    startDate,
    endDate,
    branchId: branchId !== 'all' ? branchId : undefined,
    customerId: customerId !== 'all' ? customerId : undefined,
    status: status ? status.split(',') : undefined,
    paymentStatus: paymentStatus !== 'all' ? paymentStatus : undefined,
    minAmount: minAmount ? parseFloat(minAmount) : undefined,
    maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
    productId: productId !== 'all' ? productId : undefined,
    category: category !== 'all' ? category : undefined,
    gstType: gstType !== 'all' ? gstType : undefined
  };

  // Calculate offset for pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Get main profit data
  const profitData = await ProfitCalculator.calculateAdvancedProfit(filters);

  // Get trends data
  const trends = await ProfitCalculator.getProfitTrends(
    req.user.organizationId,
    filters,
    groupBy
  );

  // Get customer profitability
  const customerProfitability = await ProfitCalculator.getCustomerProfitability(
    req.user.organizationId,
    filters,
    10
  );

  // Get category profitability
  const categoryProfitability = await ProfitCalculator.getCategoryProfitability(
    req.user.organizationId,
    filters
  );

  // Calculate comparison data if requested
  let comparisonData = null;
  if (compareWith !== 'none') {
    const comparisonFilters = { ...filters };

    if (compareWith === 'previous_period' && startDate && endDate) {
      const periodDays = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
      const previousStart = new Date(startDate);
      const previousEnd = new Date(endDate);
      previousStart.setDate(previousStart.getDate() - periodDays);
      previousEnd.setDate(previousEnd.getDate() - periodDays);

      comparisonFilters.startDate = previousStart.toISOString().split('T')[0];
      comparisonFilters.endDate = previousEnd.toISOString().split('T')[0];
    } else if (compareWith === 'same_period_last_year' && startDate && endDate) {
      const previousStart = new Date(startDate);
      const previousEnd = new Date(endDate);
      previousStart.setFullYear(previousStart.getFullYear() - 1);
      previousEnd.setFullYear(previousEnd.getFullYear() - 1);

      comparisonFilters.startDate = previousStart.toISOString().split('T')[0];
      comparisonFilters.endDate = previousEnd.toISOString().split('T')[0];
    }

    const previousProfitData = await ProfitCalculator.calculateAdvancedProfit(comparisonFilters);

    comparisonData = {
      period: compareWith,
      summary: previousProfitData.summary,
      growth: {
        revenueGrowth: profitData.summary.totalRevenue > 0 && previousProfitData.summary.totalRevenue > 0
          ? ((profitData.summary.totalRevenue - previousProfitData.summary.totalRevenue) / previousProfitData.summary.totalRevenue) * 100
          : 0,
        profitGrowth: profitData.summary.grossProfit > 0 && previousProfitData.summary.grossProfit > 0
          ? ((profitData.summary.grossProfit - previousProfitData.summary.grossProfit) / previousProfitData.summary.grossProfit) * 100
          : 0,
        marginChange: profitData.summary.profitMargin - previousProfitData.summary.profitMargin
      }
    };
  }

  // Get top & bottom performers
  const topProducts = profitData.productAnalysis
    .filter(p => p.grossProfit > 0)
    .slice(0, 10);

  const worstProducts = profitData.productAnalysis
    .filter(p => p.grossProfit <= 0)
    .slice(0, 10);

  // Calculate key performance indicators
  const kpis = {
    // Profitability KPIs
    grossProfitMargin: profitData.summary.profitMargin,
    netProfitMargin: profitData.summary.totalRevenue > 0
      ? ((profitData.summary.netProfit / profitData.summary.totalRevenue) * 100)
      : 0,

    // Efficiency KPIs
    revenuePerInvoice: profitData.summary.averageRevenuePerInvoice,
    profitPerInvoice: profitData.summary.averageProfitPerInvoice,
    itemsPerInvoice: profitData.summary.averageItemsPerInvoice,

    // Productivity KPIs
    dailyRevenue: trends.length > 0
      ? trends.reduce((sum, day) => sum + day.revenue, 0) / trends.length
      : 0,
    conversionRate: 'N/A', // Would need lead data

    // Customer KPIs
    averageCustomerValue: customerProfitability.length > 0
      ? customerProfitability.reduce((sum, cust) => sum + cust.totalProfit, 0) / customerProfitability.length
      : 0,
    topCustomerContribution: customerProfitability.length > 0
      ? (customerProfitability[0].totalProfit / profitData.summary.grossProfit) * 100
      : 0
  };

  // Build response
  const response = {
    metadata: {
      filtersApplied: {
        dateRange: { start: startDate, end: endDate },
        branch: branchId,
        customer: customerId,
        status,
        product: productId,
        category
      },
      period: {
        start: startDate || 'Beginning',
        end: endDate || 'Now',
        groupBy
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalInvoices: profitData.summary.totalInvoices,
        totalPages: Math.ceil(profitData.summary.totalInvoices / parseInt(limit))
      }
    },

    summary: {
      financials: {
        totalRevenue: profitData.summary.totalRevenue,
        totalCost: profitData.summary.totalCost,
        totalTax: profitData.summary.totalTax,
        totalDiscount: profitData.summary.totalDiscount,
        grossProfit: profitData.summary.grossProfit,
        netProfit: profitData.summary.netProfit,
        profitMargin: profitData.summary.profitMargin,
        markup: profitData.summary.markup
      },
      metrics: {
        totalInvoices: profitData.summary.totalInvoices,
        totalItems: profitData.summary.totalQuantity,
        uniqueProducts: profitData.productAnalysis.length,
        averageRevenuePerInvoice: profitData.summary.averageRevenuePerInvoice,
        averageProfitPerInvoice: profitData.summary.averageProfitPerInvoice,
        averageItemsPerInvoice: profitData.summary.averageItemsPerInvoice
      }
    },

    trends: {
      data: trends,
      summary: {
        bestDay: trends.length > 0
          ? trends.reduce((max, day) => day.profit > max.profit ? day : max, trends[0])
          : null,
        worstDay: trends.length > 0
          ? trends.reduce((min, day) => day.profit < min.profit ? day : min, trends[0])
          : null,
        averageDailyProfit: trends.length > 0
          ? trends.reduce((sum, day) => sum + day.profit, 0) / trends.length
          : 0,
        trendDirection: trends.length > 1
          ? trends[trends.length - 1].profit > trends[0].profit ? 'up' : 'down'
          : 'stable'
      }
    },

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
            ? profitData.productAnalysis.reduce((sum, p) => sum + p.profitMargin, 0) / profitData.productAnalysis.length
            : 0
        }
      },

      customerAnalysis: {
        mostProfitable: customerProfitability,
        summary: {
          totalCustomers: customerProfitability.length,
          customersWithProfit: customerProfitability.filter(c => c.totalProfit > 0).length,
          topCustomerContribution: customerProfitability.length > 0
            ? (customerProfitability[0].totalProfit / profitData.summary.grossProfit) * 100
            : 0,
          averageCustomerValue: customerProfitability.length > 0
            ? customerProfitability.reduce((sum, cust) => sum + cust.totalProfit, 0) / customerProfitability.length
            : 0
        }
      }
    },

    kpis: kpis,

    comparison: comparisonData
  };

  // Add detailed data if requested
  if (detailed === 'true') {
    const detailedMatch = ProfitCalculator.buildProfitQuery(filters);

    const detailedInvoices = await Invoice.find(detailedMatch)
      .populate({
        path: 'items.productId',
        select: 'name purchasePrice sku category'
      })
      .populate('customerId', 'name email')
      .populate('branchId', 'name')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ invoiceDate: -1 });

    response.detailedInvoices = await Promise.all(
      detailedInvoices.map(async (invoice) => {
        const profit = await ProfitCalculator.calculateInvoiceProfit(invoice, includeItems === 'true');

        return {
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          customer: {
            id: invoice.customerId?._id,
            name: invoice.customerId?.name,
            email: invoice.customerId?.email
          },
          branch: invoice.branchId?.name,
          status: invoice.status,
          paymentStatus: invoice.paymentStatus,
          ...profit,
          items: includeItems === 'true' ? profit.items : undefined
        };
      })
    );
  }

  res.status(200).json({
    status: 'success',
    data: response
  });
});

exports.getProfitDashboard = catchAsync(async (req, res, next) => {
  const {
    period = 'today',
    startDate, endDate, branchId,
    compareWith = 'previous_period'
  } = req.query;

  const orgId = req.user.organizationId;
  const { start: periodStart, end: periodEnd } = getPeriodDates(period, startDate, endDate);

  // 1. Prepare Base Filters
  const filters = {
    organizationId: orgId,
    startDate: periodStart.toISOString(),
    endDate: periodEnd.toISOString(),
    branchId: branchId !== 'all' ? branchId : undefined
  };

  // 2. Fire Current Period Queries in Parallel
  const currentDataPromise = ProfitCalculator.calculateAdvancedProfit(filters);
  const trendsPromise = ProfitCalculator.getProfitTrends(orgId, filters, 'day');
  const productsPromise = ProfitCalculator.getCustomerProfitability(orgId, filters, 5);
  const customersPromise = ProfitCalculator.getCustomerProfitability(orgId, filters, 5);
  const categoriesPromise = ProfitCalculator.getCategoryProfitability(orgId, filters);

  // 3. Handle Comparison Period (Parallel to Current)
  let comparisonPromise = Promise.resolve(null);
  if (compareWith === 'previous_period') {
    const duration = periodEnd - periodStart;
    const compFilters = {
      ...filters,
      startDate: new Date(periodStart.getTime() - duration).toISOString(),
      endDate: new Date(periodStart.getTime() - 1).toISOString()
    };
    comparisonPromise = ProfitCalculator.calculateAdvancedProfit(compFilters);
  }

  // 4. Handle "Today's Performance" snapshot (Parallel to Current)
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayPromise = ProfitCalculator.calculateAdvancedProfit({
    ...filters,
    startDate: new Date(todayStart).toISOString(),
    endDate: new Date().toISOString()
  });

  // 5. WAIT FOR ALL DATA
  const [
    currentData,
    currentTrends,
    topProducts,
    topCustomers,
    categoryData,
    previousData,
    todayData
  ] = await Promise.all([
    currentDataPromise,
    trendsPromise,
    productsPromise,
    customersPromise,
    categoriesPromise,
    comparisonPromise,
    todayPromise
  ]);

  // 6. Growth Calculations
  let growth = null;
  if (previousData) {
    const prev = previousData.summary;
    const curr = currentData.summary;
    growth = {
      revenue: prev.totalRevenue > 0 ? ((curr.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100 : 0,
      profit: prev.grossProfit > 0 ? ((curr.grossProfit - prev.grossProfit) / prev.grossProfit) * 100 : 0,
      margin: curr.profitMargin - prev.profitMargin
    };
  }

  // 7. Final Response Build
  const daysInPeriod = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24)) || 1;

  res.status(200).json({
    status: 'success',
    data: {
      period: { name: period, start: periodStart, end: periodEnd, days: daysInPeriod },
      overview: {
        today: {
          revenue: todayData.summary.totalRevenue,
          profit: todayData.summary.grossProfit,
          invoices: todayData.summary.totalInvoices
        },
        period: {
          ...currentData.summary,
          averageDailyProfit: currentData.summary.grossProfit / daysInPeriod
        }
      },
      trends: {
        daily: currentTrends.slice(-7),
        status: (currentTrends[currentTrends.length - 1]?.profit > currentTrends[0]?.profit) ? 'up' : 'down'
      },
      topPerformers: {
        products: topProducts.slice(0, 5),
        customers: topCustomers.slice(0, 5),
        categories: categoryData.slice(0, 3)
      },
      comparison: previousData ? { summary: previousData.summary, growth } : null,
      insights: {
        highMargin: currentData.productAnalysis.filter(p => p.profitMargin > 30).slice(0, 3),
        issues: currentData.productAnalysis.filter(p => p.grossProfit <= 0).slice(0, 3)
      }
    }
  });
});

/* ======================================================
   PROFIT EXPORT WITH FILTERS
====================================================== */
exports.exportProfitData = catchAsync(async (req, res, next) => {
  const {
    format = 'json', // json, csv, excel
    startDate,
    endDate,
    branchId,
    customerId,
    productId,
    category,
    includeDetails = 'false'
  } = req.query;

  const filters = {
    organizationId: req.user.organizationId,
    startDate,
    endDate,
    branchId: branchId !== 'all' ? branchId : undefined,
    customerId: customerId !== 'all' ? customerId : undefined,
    productId: productId !== 'all' ? productId : undefined,
    category: category !== 'all' ? category : undefined
  };

  // Get profit data
  const profitData = await ProfitCalculator.calculateAdvancedProfit(filters);

  // Get invoices for detailed export
  const detailedMatch = ProfitCalculator.buildProfitQuery(filters);
  const invoices = await Invoice.find(detailedMatch)
    .populate({
      path: 'items.productId',
      select: 'name purchasePrice sku category'
    })
    .populate('customerId', 'name')
    .populate('branchId', 'name')
    .sort({ invoiceDate: -1 });

  // Prepare export data based on format
  let exportData;
  let filename;
  let contentType;

  switch (format) {
    case 'csv':
      // Convert to CSV format
      const csvData = [];

      // Summary section
      csvData.push(['PROFIT ANALYSIS REPORT']);
      csvData.push(['Period', `${startDate || 'Beginning'} to ${endDate || 'Now'}`]);
      csvData.push([]);

      // Financial summary
      csvData.push(['FINANCIAL SUMMARY']);
      csvData.push(['Total Revenue', profitData.summary.totalRevenue]);
      csvData.push(['Total Cost', profitData.summary.totalCost]);
      csvData.push(['Total Tax', profitData.summary.totalTax]);
      csvData.push(['Total Discount', profitData.summary.totalDiscount]);
      csvData.push(['Gross Profit', profitData.summary.grossProfit]);
      csvData.push(['Profit Margin', `${profitData.summary.profitMargin.toFixed(2)}%`]);
      csvData.push(['Markup', `${profitData.summary.markup.toFixed(2)}%`]);
      csvData.push([]);

      // Metrics
      csvData.push(['PERFORMANCE METRICS']);
      csvData.push(['Total Invoices', profitData.summary.totalInvoices]);
      csvData.push(['Total Items Sold', profitData.summary.totalQuantity]);
      csvData.push(['Average Revenue per Invoice', profitData.summary.averageRevenuePerInvoice]);
      csvData.push(['Average Profit per Invoice', profitData.summary.averageProfitPerInvoice]);
      csvData.push([]);

      // Top products
      csvData.push(['TOP 10 PRODUCTS BY PROFIT']);
      csvData.push(['Product Name', 'SKU', 'Quantity', 'Revenue', 'Cost', 'Profit', 'Margin']);
      profitData.productAnalysis.slice(0, 10).forEach(product => {
        csvData.push([
          product.productName,
          product.sku || '',
          product.totalQuantity,
          product.totalRevenue,
          product.totalCost,
          product.grossProfit,
          `${product.profitMargin.toFixed(2)}%`
        ]);
      });

      if (includeDetails === 'true') {
        csvData.push([]);
        csvData.push(['DETAILED INVOICE DATA']);
        csvData.push(['Invoice Number', 'Date', 'Customer', 'Revenue', 'Cost', 'Profit', 'Margin']);

        for (const invoice of invoices) {
          const profit = await ProfitCalculator.calculateInvoiceProfit(invoice);
          csvData.push([
            invoice.invoiceNumber,
            invoice.invoiceDate.toISOString().split('T')[0],
            invoice.customerId?.name || 'Unknown',
            profit.revenue,
            profit.cost,
            profit.grossProfit,
            `${profit.margin.toFixed(2)}%`
          ]);
        }
      }

      // Convert to CSV string
      exportData = csvData.map(row => row.join(',')).join('\n');
      filename = `profit-analysis-${Date.now()}.csv`;
      contentType = 'text/csv';
      break;

    case 'excel':
      // For Excel, you'd typically use a library like exceljs
      // This is a simplified version - in production, use proper Excel generation
      exportData = JSON.stringify({
        summary: profitData.summary,
        products: profitData.productAnalysis,
        invoices: includeDetails === 'true' ? await Promise.all(
          invoices.map(async (invoice) => {
            const profit = await ProfitCalculator.calculateInvoiceProfit(invoice);
            return {
              invoiceNumber: invoice.invoiceNumber,
              date: invoice.invoiceDate,
              customer: invoice.customerId?.name,
              revenue: profit.revenue,
              cost: profit.cost,
              profit: profit.grossProfit,
              margin: profit.margin
            };
          })
        ) : []
      }, null, 2);
      filename = `profit-analysis-${Date.now()}.json`;
      contentType = 'application/json';
      break;

    default: // json
      exportData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          filters,
          period: {
            start: startDate || 'Beginning',
            end: endDate || 'Now'
          }
        },
        summary: profitData.summary,
        productAnalysis: profitData.productAnalysis,
        trends: await ProfitCalculator.getProfitTrends(req.user.organizationId, filters, 'day'),
        customerAnalysis: await ProfitCalculator.getCustomerProfitability(req.user.organizationId, filters, 20),
        categoryAnalysis: await ProfitCalculator.getCategoryProfitability(req.user.organizationId, filters),
        detailedInvoices: includeDetails === 'true' ? await Promise.all(
          invoices.slice(0, 100).map(async (invoice) => {
            const profit = await ProfitCalculator.calculateInvoiceProfit(invoice, true);
            return {
              invoiceId: invoice._id,
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.invoiceDate,
              customer: invoice.customerId?.name,
              branch: invoice.branchId?.name,
              status: invoice.status,
              paymentStatus: invoice.paymentStatus,
              ...profit
            };
          })
        ) : []
      };

      exportData = JSON.stringify(exportData, null, 2);
      filename = `profit-analysis-${Date.now()}.json`;
      contentType = 'application/json';
  }

  // Set headers and send file
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  if (format === 'csv') {
    res.send(exportData);
  } else {
    res.send(exportData);
  }
});
