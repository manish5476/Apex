const mongoose = require("mongoose");
const { z } = require("zod");
const { format } = require('fast-csv');
const Invoice = require("../invoice.model");
const { invalidateOpeningBalance } = require("../../core/ledgerCache.service");
const ProfitCalculator = require('../utils/profitCalculator');

const Payment = require("../../payments/payment.model");
const Product = require("../../../inventory/core/product.model");
const Customer = require("../../../organization/core/customer.model");
const AccountEntry = require('../../core/accountEntry.model');
const Account = require('../../core/account.model');
const Organization = require("../../../organization/core/organization.model");
const InvoiceAudit = require('../invoiceAudit.model');

const SalesService = require("../../../inventory/core/sales.service");
const invoicePDFService = require("../invoicePDFService");
const StockValidationService = require("../../../inventory/core/stockValidationService");
const { createNotification } = require("../../../notification/core/notification.service");
// CHANGED: Import the whole service to access reverseInvoiceJournal
const salesJournalService = require('../../../inventory/core/salesJournal.service');

const catchAsync = require("../../../../core/utils/api/catchAsync");
const AppError = require("../../../../core/utils/api/appError");
const factory = require("../../../../core/utils/api/handlerFactory");
const { runInTransaction } = require("../../../../core/utils/db/runInTransaction");
const { emitToOrg } = require("../../../../socketHandlers/socket");
const automationService = require('../../../webhook/automationService');



exports.profitSummary = catchAsync(async (req, res, next) => {
  const { startDate, endDate, branchId } = req.query;
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

  const invoices = await Invoice.find(match)
    .populate({
      path: 'items.productId',
      select: 'name purchasePrice'
    })
    .lean();

  let totalRevenue = 0, totalCost = 0, totalProfit = 0;
  let productCounts = {};
  
  for (const invoice of invoices) {
    totalRevenue += invoice.grandTotal || 0;
    
    let invoiceCost = 0;
    for (const item of invoice.items) {
      if (item.productId) {
        const purchasePrice = item.productId.purchasePrice || 0;
        invoiceCost += purchasePrice * item.quantity;
        
        // Count products
        const productId = item.productId._id.toString();
        productCounts[productId] = (productCounts[productId] || 0) + item.quantity;
      }
    }
    
    totalCost += invoiceCost;
    totalProfit += (invoice.grandTotal - invoiceCost);
  }

  // Calculate additional metrics
  const uniqueProducts = Object.keys(productCounts).length;
  const averageProductPrice = totalRevenue > 0 ? totalRevenue / Object.values(productCounts).reduce((a, b) => a + b, 0) : 0;

  res.status(200).json({
    status: "success",
    data: {
      financials: {
        totalRevenue,
        totalCost,
        totalProfit,
        profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0,
        markup: totalCost > 0 ? ((totalProfit / totalCost) * 100).toFixed(2) : 0
      },
      metrics: {
        totalInvoices: invoices.length,
        uniqueProducts,
        averageRevenuePerInvoice: invoices.length > 0 ? (totalRevenue / invoices.length).toFixed(2) : 0,
        averageProfitPerInvoice: invoices.length > 0 ? (totalProfit / invoices.length).toFixed(2) : 0,
        averageProductPrice: averageProductPrice.toFixed(2)
      },
      period: {
        start: startDate || 'Beginning',
        end: endDate || 'Now'
      }
    }
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

/* ======================================================
   PROFIT SUMMARY DASHBOARD WITH FILTERS
====================================================== */
exports.getProfitDashboard = catchAsync(async (req, res, next) => {
  const { 
    period = 'today', // today, yesterday, this_week, last_week, this_month, last_month, this_year, last_year, custom
    startDate,
    endDate,
    branchId,
    compareWith = 'previous_period'
  } = req.query;

  const now = new Date();
  let periodStart, periodEnd;
  
  // Set period based on parameter
  switch (period) {
    case 'today':
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodEnd = now;
      break;
    case 'yesterday':
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      periodStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      periodEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
      break;
    case 'this_week':
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      periodStart = new Date(now.setDate(diff));
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = now;
      break;
    case 'last_week':
      const lastWeekStart = new Date(now);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7 - now.getDay() + 1);
      lastWeekStart.setHours(0, 0, 0, 0);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
      lastWeekEnd.setHours(23, 59, 59, 999);
      periodStart = lastWeekStart;
      periodEnd = lastWeekEnd;
      break;
    case 'this_month':
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = now;
      break;
    case 'last_month':
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    case 'this_year':
      periodStart = new Date(now.getFullYear(), 0, 1);
      periodEnd = now;
      break;
    case 'last_year':
      periodStart = new Date(now.getFullYear() - 1, 0, 1);
      periodEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      break;
    case 'custom':
      periodStart = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = endDate ? new Date(endDate) : now;
      break;
    default:
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodEnd = now;
  }

  // Build filters for current period
  const filters = {
    organizationId: req.user.organizationId,
    startDate: periodStart.toISOString().split('T')[0],
    endDate: periodEnd.toISOString().split('T')[0],
    branchId: branchId !== 'all' ? branchId : undefined
  };

  // Get current period data
  const currentData = await ProfitCalculator.calculateAdvancedProfit(filters);
  const currentTrends = await ProfitCalculator.getProfitTrends(req.user.organizationId, filters, 'day');
  const topProducts = await ProfitCalculator.getCustomerProfitability(req.user.organizationId, filters, 5);
  const topCustomers = await ProfitCalculator.getCustomerProfitability(req.user.organizationId, filters, 5);

  // Get comparison data
  let comparisonData = null;
  if (compareWith !== 'none') {
    let comparisonFilters = { ...filters };
    
    if (compareWith === 'previous_period') {
      const periodLength = periodEnd - periodStart;
      const previousStart = new Date(periodStart.getTime() - periodLength);
      const previousEnd = new Date(periodStart.getTime() - 1);
      
      comparisonFilters.startDate = previousStart.toISOString().split('T')[0];
      comparisonFilters.endDate = previousEnd.toISOString().split('T')[0];
    }
    
    const previousData = await ProfitCalculator.calculateAdvancedProfit(comparisonFilters);
    
    comparisonData = {
      period: compareWith,
      summary: previousData.summary,
      growth: {
        revenue: currentData.summary.totalRevenue > 0 && previousData.summary.totalRevenue > 0
          ? ((currentData.summary.totalRevenue - previousData.summary.totalRevenue) / previousData.summary.totalRevenue) * 100
          : 0,
        profit: currentData.summary.grossProfit > 0 && previousData.summary.grossProfit > 0
          ? ((currentData.summary.grossProfit - previousData.summary.grossProfit) / previousData.summary.grossProfit) * 100
          : 0,
        margin: currentData.summary.profitMargin - previousData.summary.profitMargin
      }
    };
  }

  // Calculate today's performance
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayFilters = {
    ...filters,
    startDate: todayStart.toISOString().split('T')[0],
    endDate: now.toISOString()
  };
  
  const todayData = await ProfitCalculator.calculateAdvancedProfit(todayFilters);

  // Calculate performance metrics
  const daysInPeriod = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
  const averageDailyProfit = daysInPeriod > 0 ? currentData.summary.grossProfit / daysInPeriod : 0;
  const profitPerDay = currentTrends.length > 0 
    ? currentTrends.map(day => day.profit)
    : [];

  // Build dashboard response
  res.status(200).json({
    status: 'success',
    data: {
      period: {
        name: period,
        start: periodStart,
        end: periodEnd,
        days: daysInPeriod
      },
      
      overview: {
        today: {
          revenue: todayData.summary.totalRevenue,
          profit: todayData.summary.grossProfit,
          invoices: todayData.summary.totalInvoices,
          averageOrderValue: todayData.summary.averageRevenuePerInvoice
        },
        period: {
          revenue: currentData.summary.totalRevenue,
          cost: currentData.summary.totalCost,
          profit: currentData.summary.grossProfit,
          margin: currentData.summary.profitMargin,
          invoices: currentData.summary.totalInvoices,
          items: currentData.summary.totalQuantity,
          averageDailyProfit
        }
      },
      
      trends: {
        daily: currentTrends.slice(-7), // Last 7 days
        summary: {
          bestDay: currentTrends.length > 0
            ? currentTrends.reduce((max, day) => day.profit > max.profit ? day : max, currentTrends[0])
            : null,
          averageDailyRevenue: currentTrends.length > 0
            ? currentTrends.reduce((sum, day) => sum + day.revenue, 0) / currentTrends.length
            : 0,
          trend: profitPerDay.length > 1
            ? profitPerDay[profitPerDay.length - 1] > profitPerDay[0] ? 'up' : 'down'
            : 'stable'
        }
      },
      
      topPerformers: {
        products: topProducts.slice(0, 5),
        customers: topCustomers.slice(0, 5),
        categories: (await ProfitCalculator.getCategoryProfitability(req.user.organizationId, filters)).slice(0, 3)
      },
      
      metrics: {
        efficiency: {
          revenuePerInvoice: currentData.summary.averageRevenuePerInvoice,
          profitPerInvoice: currentData.summary.averageProfitPerInvoice,
          itemsPerInvoice: currentData.summary.averageItemsPerInvoice
        },
        profitability: {
          grossMargin: currentData.summary.profitMargin,
          netMargin: currentData.summary.totalRevenue > 0
            ? ((currentData.summary.netProfit / currentData.summary.totalRevenue) * 100)
            : 0,
          markup: currentData.summary.markup
        }
      },
      
      comparison: comparisonData,
      
      insights: {
        // Add business insights based on data
        highMarginProducts: currentData.productAnalysis
          .filter(p => p.profitMargin > 30)
          .slice(0, 3),
        lowMarginProducts: currentData.productAnalysis
          .filter(p => p.profitMargin < 10 && p.grossProfit > 0)
          .slice(0, 3),
        potentialImprovements: currentData.productAnalysis
          .filter(p => p.grossProfit <= 0)
          .slice(0, 3)
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
