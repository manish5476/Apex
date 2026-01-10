// utils/profitCalculator.js
const mongoose = require('mongoose');
const Product = require("../../../inventory/core/product.model");
const Invoice = require("../invoice.model");
class ProfitCalculator {
  /**
   * Enhanced profit calculation with tax, discount considerations
   */
  static async calculateInvoiceProfit(invoice, includeDetails = false) {
    if (!invoice || !invoice.items || invoice.items.length === 0) {
      return {
        revenue: 0,
        cost: 0,
        tax: 0,
        discount: 0,
        netProfit: 0,
        grossProfit: 0,
        margin: 0,
        items: []
      };
    }

    let totalRevenue = invoice.grandTotal || 0;
    let totalTax = invoice.totalTax || 0;
    let totalDiscount = invoice.totalDiscount || 0;
    let totalCost = 0;
    const itemProfits = [];

    // Calculate profit for each item with proper tax allocation
    for (const item of invoice.items) {
      let itemCost = 0;
      let itemRevenue = 0;
      let itemTax = 0;
      
      // Calculate base revenue before discount
      const baseRevenue = item.price * item.quantity;
      const itemDiscount = item.discount || 0;
      const revenueAfterDiscount = baseRevenue - itemDiscount;
      
      // Calculate tax on the discounted amount
      itemTax = (item.taxRate || 0) / 100 * revenueAfterDiscount;
      
      if (item.productId) {
        // If product is populated
        const product = item.productId;
        itemCost = (product.purchasePrice || 0) * item.quantity;
        itemRevenue = revenueAfterDiscount + itemTax;
      } else {
        // If product is not populated, fetch it
        const product = await Product.findById(item.productId).lean();
        if (product) {
          itemCost = (product.purchasePrice || 0) * item.quantity;
          itemRevenue = revenueAfterDiscount + itemTax;
        } else {
          itemCost = 0;
          itemRevenue = revenueAfterDiscount + itemTax;
        }
      }

      const itemGrossProfit = revenueAfterDiscount - itemCost;
      const itemNetProfit = itemRevenue - itemCost;
      const itemMargin = revenueAfterDiscount > 0 ? (itemGrossProfit / revenueAfterDiscount) * 100 : 0;

      itemProfits.push({
        productId: item.productId?._id || item.productId,
        productName: item.name,
        sku: item.productId?.sku || '',
        quantity: item.quantity,
        sellingPrice: item.price,
        costPrice: itemCost / item.quantity,
        discount: itemDiscount,
        taxRate: item.taxRate || 0,
        taxAmount: itemTax,
        revenue: itemRevenue,
        cost: itemCost,
        grossProfit: itemGrossProfit,
        netProfit: itemNetProfit,
        profitMargin: itemMargin,
        markup: itemCost > 0 ? (itemGrossProfit / itemCost) * 100 : 0
      });

      totalCost += itemCost;
    }

    const grossProfit = totalRevenue - totalTax - totalDiscount - totalCost;
    const netProfit = totalRevenue - totalCost;
    const profitMargin = (totalRevenue - totalTax - totalDiscount) > 0 
      ? (grossProfit / (totalRevenue - totalTax - totalDiscount)) * 100 
      : 0;

    const result = {
      revenue: totalRevenue,
      cost: totalCost,
      tax: totalTax,
      discount: totalDiscount,
      grossProfit,
      netProfit,
      margin: profitMargin,
      markup: totalCost > 0 ? (grossProfit / totalCost) * 100 : 0
    };

    if (includeDetails) {
      result.items = itemProfits;
    }

    return result;
  }

  /**
   * Advanced filtering capabilities
   */
  static buildProfitQuery(filters = {}) {
    const {
      organizationId,
      startDate,
      endDate,
      branchId,
      customerId,
      status = ['issued', 'paid'],
      paymentStatus,
      minAmount,
      maxAmount,
      productId,
      category,
      gstType
    } = filters;

    const match = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      isDeleted: { $ne: true }
    };

    // Status filter
    if (status && status.length > 0) {
      match.status = { $in: status };
    }

    // Date range filter
    if (startDate || endDate) {
      match.invoiceDate = {};
      if (startDate) match.invoiceDate.$gte = new Date(startDate);
      if (endDate) match.invoiceDate.$lte = new Date(endDate);
    }

    // Branch filter
    if (branchId && branchId !== 'all') {
      match.branchId = new mongoose.Types.ObjectId(branchId);
    }

    // Customer filter
    if (customerId && customerId !== 'all') {
      match.customerId = new mongoose.Types.ObjectId(customerId);
    }

    // Payment status filter
    if (paymentStatus && paymentStatus !== 'all') {
      match.paymentStatus = paymentStatus;
    }

    // Amount range filter
    if (minAmount !== undefined || maxAmount !== undefined) {
      match.grandTotal = {};
      if (minAmount !== undefined) match.grandTotal.$gte = Number(minAmount);
      if (maxAmount !== undefined) match.grandTotal.$lte = Number(maxAmount);
    }

    // Product filter
    if (productId && productId !== 'all') {
      match['items.productId'] = new mongoose.Types.ObjectId(productId);
    }

    // GST type filter
    if (gstType && gstType !== 'all') {
      match.gstType = gstType;
    }

    return match;
  }

  /**
   * Enhanced bulk profit calculation with advanced aggregation
   */
  static async calculateAdvancedProfit(filters = {}) {
    const match = this.buildProfitQuery(filters);
    
    // Use MongoDB aggregation for better performance
    const aggregation = [
      { $match: match },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          totalRevenue: { $sum: '$grandTotal' },
          totalTax: { $sum: '$totalTax' },
          totalDiscount: { $sum: '$totalDiscount' },
          totalQuantity: { $sum: '$items.quantity' },
          
          // Cost calculation
          totalCost: {
            $sum: {
              $multiply: [
                { $ifNull: ['$product.purchasePrice', 0] },
                '$items.quantity'
              ]
            }
          },
          
          // Product-level aggregation
          products: {
            $push: {
              productId: '$product._id',
              productName: '$items.name',
              sku: '$product.sku',
              quantity: '$items.quantity',
              sellingPrice: '$items.price',
              costPrice: { $ifNull: ['$product.purchasePrice', 0] },
              taxRate: '$items.taxRate',
              discount: '$items.discount',
              revenue: {
                $multiply: ['$items.price', '$items.quantity']
              }
            }
          }
        }
      },
      {
        $project: {
          totalInvoices: 1,
          totalRevenue: 1,
          totalTax: 1,
          totalDiscount: 1,
          totalCost: 1,
          totalQuantity: 1,
          grossProfit: {
            $subtract: [
              { $subtract: ['$totalRevenue', '$totalTax'] },
              { $add: ['$totalCost', '$totalDiscount'] }
            ]
          },
          products: 1
        }
      }
    ];

    const result = await Invoice.aggregate(aggregation);
    
    if (result.length === 0) {
      return {
        summary: this.getEmptySummary(),
        productAnalysis: []
      };
    }

    const data = result[0];
    const grossProfit = data.grossProfit || 0;
    const revenueAfterTax = data.totalRevenue - data.totalTax;
    const profitMargin = revenueAfterTax > 0 
      ? (grossProfit / revenueAfterTax) * 100 
      : 0;
    const markup = data.totalCost > 0 ? (grossProfit / data.totalCost) * 100 : 0;

    // Process product-level data
    const productMap = new Map();
    data.products.forEach(p => {
      if (!p.productId) return;
      
      const key = p.productId.toString();
      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: p.productId,
          productName: p.productName,
          sku: p.sku,
          totalQuantity: 0,
          totalRevenue: 0,
          totalCost: 0,
          totalTax: 0,
          totalDiscount: 0
        });
      }
      
      const product = productMap.get(key);
      const itemRevenue = p.revenue || (p.sellingPrice * p.quantity);
      const itemCost = (p.costPrice || 0) * p.quantity;
      const itemTax = (itemRevenue * (p.taxRate || 0)) / 100;
      const itemDiscount = p.discount || 0;
      
      product.totalQuantity += p.quantity;
      product.totalRevenue += itemRevenue;
      product.totalCost += itemCost;
      product.totalTax += itemTax;
      product.totalDiscount += itemDiscount;
    });

    const productAnalysis = Array.from(productMap.values()).map(p => {
      const grossProfit = p.totalRevenue - p.totalCost - p.totalDiscount;
      const netProfit = p.totalRevenue - p.totalCost;
      return {
        ...p,
        grossProfit,
        netProfit,
        profitMargin: p.totalRevenue > 0 ? (grossProfit / p.totalRevenue) * 100 : 0,
        markup: p.totalCost > 0 ? (grossProfit / p.totalCost) * 100 : 0,
        averageSellingPrice: p.totalQuantity > 0 ? p.totalRevenue / p.totalQuantity : 0,
        averageCostPrice: p.totalQuantity > 0 ? p.totalCost / p.totalQuantity : 0,
        profitPerUnit: p.totalQuantity > 0 ? grossProfit / p.totalQuantity : 0
      };
    }).sort((a, b) => b.grossProfit - a.grossProfit);

    return {
      summary: {
        totalInvoices: data.totalInvoices,
        totalRevenue: data.totalRevenue,
        totalCost: data.totalCost,
        totalTax: data.totalTax,
        totalDiscount: data.totalDiscount,
        totalQuantity: data.totalQuantity,
        grossProfit,
        netProfit: data.totalRevenue - data.totalCost,
        profitMargin,
        markup,
        averageRevenuePerInvoice: data.totalInvoices > 0 ? data.totalRevenue / data.totalInvoices : 0,
        averageProfitPerInvoice: data.totalInvoices > 0 ? grossProfit / data.totalInvoices : 0,
        averageItemsPerInvoice: data.totalInvoices > 0 ? data.totalQuantity / data.totalInvoices : 0
      },
      productAnalysis
    };
  }

  /**
   * Get profit trends with multiple grouping options
   */
  static async getProfitTrends(orgId, filters = {}, groupBy = 'day') {
    const match = this.buildProfitQuery({ organizationId: orgId, ...filters });
    
    let groupStage;
    let sortStage = { _id: 1 };
    
    switch (groupBy) {
      case 'hour':
        groupStage = {
          $group: {
            _id: {
              year: { $year: '$invoiceDate' },
              month: { $month: '$invoiceDate' },
              day: { $dayOfMonth: '$invoiceDate' },
              hour: { $hour: '$invoiceDate' }
            },
            revenue: { $sum: '$grandTotal' },
            invoiceCount: { $sum: 1 },
            itemCount: { $sum: { $size: '$items' } }
          }
        };
        break;
        
      case 'day':
        groupStage = {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } }
            },
            revenue: { $sum: '$grandTotal' },
            invoiceCount: { $sum: 1 },
            itemCount: { $sum: { $size: '$items' } }
          }
        };
        sortStage = { '_id.date': 1 };
        break;
        
      case 'week':
        groupStage = {
          $group: {
            _id: {
              year: { $year: '$invoiceDate' },
              week: { $week: '$invoiceDate' }
            },
            revenue: { $sum: '$grandTotal' },
            invoiceCount: { $sum: 1 },
            itemCount: { $sum: { $size: '$items' } }
          }
        };
        break;
        
      case 'month':
        groupStage = {
          $group: {
            _id: {
              year: { $year: '$invoiceDate' },
              month: { $month: '$invoiceDate' }
            },
            revenue: { $sum: '$grandTotal' },
            invoiceCount: { $sum: 1 },
            itemCount: { $sum: { $size: '$items' } }
          }
        };
        break;
        
      case 'quarter':
        groupStage = {
          $group: {
            _id: {
              year: { $year: '$invoiceDate' },
              quarter: {
                $ceil: { $divide: [{ $month: '$invoiceDate' }, 3] }
              }
            },
            revenue: { $sum: '$grandTotal' },
            invoiceCount: { $sum: 1 },
            itemCount: { $sum: { $size: '$items' } }
          }
        };
        break;
        
      case 'year':
        groupStage = {
          $group: {
            _id: { $year: '$invoiceDate' },
            revenue: { $sum: '$grandTotal' },
            invoiceCount: { $sum: 1 },
            itemCount: { $sum: { $size: '$items' } }
          }
        };
        break;
        
      default:
        groupStage = {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } }
            },
            revenue: { $sum: '$grandTotal' },
            invoiceCount: { $sum: 1 },
            itemCount: { $sum: { $size: '$items' } }
          }
        };
    }

    const aggregation = [
      { $match: match },
      groupStage,
      { $sort: sortStage }
    ];

    const trends = await Invoice.aggregate(aggregation);
    
    // We'll need to calculate cost separately for each period
    const trendsWithCost = await Promise.all(
      trends.map(async (trend) => {
        let periodFilter = { ...filters, organizationId: orgId };
        
        // Add date filter based on period
        if (groupBy === 'day' && trend._id.date) {
          const date = new Date(trend._id.date);
          periodFilter.startDate = date;
          periodFilter.endDate = new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
        }
        
        const periodMatch = this.buildProfitQuery(periodFilter);
        const costAggregation = [
          { $match: periodMatch },
          { $unwind: '$items' },
          {
            $lookup: {
              from: 'products',
              localField: 'items.productId',
              foreignField: '_id',
              as: 'product'
            }
          },
          { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: null,
              totalCost: {
                $sum: {
                  $multiply: [
                    { $ifNull: ['$product.purchasePrice', 0] },
                    '$items.quantity'
                  ]
                }
              }
            }
          }
        ];
        
        const costResult = await Invoice.aggregate(costAggregation);
        const totalCost = costResult[0]?.totalCost || 0;
        const profit = trend.revenue - totalCost;
        const margin = trend.revenue > 0 ? (profit / trend.revenue) * 100 : 0;
        
        return {
          period: groupBy === 'day' ? trend._id.date : 
                  groupBy === 'week' ? `Week ${trend._id.week}, ${trend._id.year}` :
                  groupBy === 'month' ? `${trend._id.year}-${String(trend._id.month).padStart(2, '0')}` :
                  groupBy === 'quarter' ? `Q${trend._id.quarter} ${trend._id.year}` :
                  groupBy === 'year' ? trend._id.toString() :
                  trend._id,
          revenue: trend.revenue,
          cost: totalCost,
          profit,
          margin,
          invoiceCount: trend.invoiceCount,
          itemCount: trend.itemCount,
          averageOrderValue: trend.invoiceCount > 0 ? trend.revenue / trend.invoiceCount : 0
        };
      })
    );

    return trendsWithCost;
  }

  /**
   * Customer profitability analysis
   */
  static async getCustomerProfitability(orgId, filters = {}, limit = 20) {
    const match = this.buildProfitQuery({ organizationId: orgId, ...filters });
    
    const aggregation = [
      { $match: match },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$customerId',
          customerName: { $first: '$customerId' }, // This will be populated later
          totalInvoices: { $sum: 1 },
          totalRevenue: { $sum: '$grandTotal' },
          totalQuantity: { $sum: '$items.quantity' },
          totalCost: {
            $sum: {
              $multiply: [
                { $ifNull: ['$product.purchasePrice', 0] },
                '$items.quantity'
              ]
            }
          }
        }
      },
      {
        $project: {
          customerId: '$_id',
          customerName: 1,
          totalInvoices: 1,
          totalRevenue: 1,
          totalCost: 1,
          totalQuantity: 1,
          totalProfit: { $subtract: ['$totalRevenue', '$totalCost'] },
          profitMargin: {
            $cond: [
              { $gt: ['$totalRevenue', 0] },
              { $multiply: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCost'] }, '$totalRevenue'] }, 100] },
              0
            ]
          },
          averageOrderValue: {
            $cond: [
              { $gt: ['$totalInvoices', 0] },
              { $divide: ['$totalRevenue', '$totalInvoices'] },
              0
            ]
          }
        }
      },
      { $sort: { totalProfit: -1 } },
      { $limit: limit }
    ];

    return await Invoice.aggregate(aggregation);
  }

  /**
   * Category-wise profit analysis
   */
  static async getCategoryProfitability(orgId, filters = {}) {
    const match = this.buildProfitQuery({ organizationId: orgId, ...filters });
    
    const aggregation = [
      { $match: match },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$product.category',
          category: { $first: '$product.category' },
          totalRevenue: {
            $sum: { $multiply: ['$items.price', '$items.quantity'] }
          },
          totalCost: {
            $sum: {
              $multiply: [
                { $ifNull: ['$product.purchasePrice', 0] },
                '$items.quantity'
              ]
            }
          },
          totalQuantity: { $sum: '$items.quantity' },
          productCount: { $addToSet: '$product._id' }
        }
      },
      {
        $project: {
          category: 1,
          totalRevenue: 1,
          totalCost: 1,
          totalQuantity: 1,
          totalProfit: { $subtract: ['$totalRevenue', '$totalCost'] },
          profitMargin: {
            $cond: [
              { $gt: ['$totalRevenue', 0] },
              { $multiply: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCost'] }, '$totalRevenue'] }, 100] },
              0
            ]
          },
          uniqueProducts: { $size: '$productCount' },
          averageRevenuePerProduct: {
            $cond: [
              { $gt: [{ $size: '$productCount' }, 0] },
              { $divide: ['$totalRevenue', { $size: '$productCount' }] },
              0
            ]
          }
        }
      },
      { $sort: { totalProfit: -1 } }
    ];

    return await Invoice.aggregate(aggregation);
  }

  static getEmptySummary() {
    return {
      totalInvoices: 0,
      totalRevenue: 0,
      totalCost: 0,
      totalTax: 0,
      totalDiscount: 0,
      totalQuantity: 0,
      grossProfit: 0,
      netProfit: 0,
      profitMargin: 0,
      markup: 0,
      averageRevenuePerInvoice: 0,
      averageProfitPerInvoice: 0,
      averageItemsPerInvoice: 0
    };
  }
}

module.exports = ProfitCalculator;

// // utils/profitCalculator.js
// const Product = require("../../../inventory/core/product.model");
// const Invoice = require("../invoice.model");

// class ProfitCalculator {
//   /**
//    * Calculate profit for a single invoice
//    */
//   static async calculateInvoiceProfit(invoice) {
//     if (!invoice || !invoice.items || invoice.items.length === 0) {
//       return {
//         revenue: 0,
//         cost: 0,
//         profit: 0,
//         margin: 0,
//         items: []
//       };
//     }

//     let totalRevenue = invoice.grandTotal || 0;
//     let totalCost = 0;
//     const itemProfits = [];

//     // Calculate profit for each item
//     for (const item of invoice.items) {
//       let itemCost = 0;
//       let itemRevenue = 0;
      
//       if (item.productId) {
//         // If product is populated
//         const product = item.productId;
//         itemCost = (product.purchasePrice || 0) * item.quantity;
//         itemRevenue = item.price * item.quantity;
//       } else {
//         // If product is not populated, fetch it
//         const product = await Product.findById(item.productId).lean();
//         if (product) {
//           itemCost = (product.purchasePrice || 0) * item.quantity;
//           itemRevenue = item.price * item.quantity;
//         } else {
//           itemCost = 0;
//           itemRevenue = item.price * item.quantity;
//         }
//       }

//       const itemProfit = itemRevenue - itemCost;
//       const itemMargin = itemRevenue > 0 ? (itemProfit / itemRevenue) * 100 : 0;

//       itemProfits.push({
//         productId: item.productId._id || item.productId,
//         productName: item.name,
//         quantity: item.quantity,
//         sellingPrice: item.price,
//         costPrice: itemCost / item.quantity,
//         revenue: itemRevenue,
//         cost: itemCost,
//         profit: itemProfit,
//         profitMargin: itemMargin
//       });

//       totalCost += itemCost;
//     }

//     const totalProfit = totalRevenue - totalCost;
//     const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

//     return {
//       revenue: totalRevenue,
//       cost: totalCost,
//       profit: totalProfit,
//       margin: profitMargin,
//       items: itemProfits
//     };
//   }

//   /**
//    * Calculate profit for multiple invoices
//    */
//   static async calculateBulkProfit(invoices) {
//     let totalRevenue = 0;
//     let totalCost = 0;
//     let totalProfit = 0;
//     const productWiseProfits = {};

//     for (const invoice of invoices) {
//       const profitData = await this.calculateInvoiceProfit(invoice);
      
//       totalRevenue += profitData.revenue;
//       totalCost += profitData.cost;
//       totalProfit += profitData.profit;

//       // Aggregate by product
//       for (const itemProfit of profitData.items) {
//         const productId = itemProfit.productId.toString();
        
//         if (!productWiseProfits[productId]) {
//           productWiseProfits[productId] = {
//             productId,
//             productName: itemProfit.productName,
//             totalQuantity: 0,
//             totalRevenue: 0,
//             totalCost: 0,
//             totalProfit: 0
//           };
//         }

//         productWiseProfits[productId].totalQuantity += itemProfit.quantity;
//         productWiseProfits[productId].totalRevenue += itemProfit.revenue;
//         productWiseProfits[productId].totalCost += itemProfit.cost;
//         productWiseProfits[productId].totalProfit += itemProfit.profit;
//       }
//     }

//     // Calculate margins for each product
//     const productProfitArray = Object.values(productWiseProfits).map(product => ({
//       ...product,
//       averagePrice: product.totalRevenue / product.totalQuantity,
//       averageCost: product.totalCost / product.totalQuantity,
//       profitMargin: product.totalRevenue > 0 ? (product.totalProfit / product.totalRevenue) * 100 : 0,
//       profitPerUnit: product.totalProfit / product.totalQuantity
//     }));

//     return {
//       summary: {
//         totalRevenue,
//         totalCost,
//         totalProfit,
//         profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
//         totalInvoices: invoices.length,
//         averageRevenuePerInvoice: invoices.length > 0 ? totalRevenue / invoices.length : 0,
//         averageProfitPerInvoice: invoices.length > 0 ? totalProfit / invoices.length : 0
//       },
//       productAnalysis: productProfitArray.sort((a, b) => b.totalProfit - a.totalProfit)
//     };
//   }

//   /**
//    * Get profit by time period
//    */
//   static async getProfitByPeriod(orgId, startDate, endDate, groupBy = 'day') {
//     const match = {
//       organizationId: orgId,
//       status: { $in: ['issued', 'paid'] },
//       isDeleted: { $ne: true }
//     };

//     if (startDate || endDate) {
//       match.invoiceDate = {};
//       if (startDate) match.invoiceDate.$gte = new Date(startDate);
//       if (endDate) match.invoiceDate.$lte = new Date(endDate);
//     }

//     // Fetch invoices with product details
//     const invoices = await Invoice.find(match)
//       .populate({
//         path: 'items.productId',
//         select: 'name purchasePrice'
//       })
//       .lean();

//     const groupedData = {};
    
//     for (const invoice of invoices) {
//       const invoiceDate = new Date(invoice.invoiceDate);
//       let groupKey;
      
//       switch (groupBy) {
//         case 'day':
//           groupKey = invoiceDate.toISOString().split('T')[0]; // YYYY-MM-DD
//           break;
//         case 'week':
//           const weekStart = new Date(invoiceDate);
//           weekStart.setDate(invoiceDate.getDate() - invoiceDate.getDay());
//           groupKey = weekStart.toISOString().split('T')[0];
//           break;
//         case 'month':
//           groupKey = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;
//           break;
//         case 'year':
//           groupKey = invoiceDate.getFullYear().toString();
//           break;
//         default:
//           groupKey = invoiceDate.toISOString().split('T')[0];
//       }

//       if (!groupedData[groupKey]) {
//         groupedData[groupKey] = {
//           period: groupKey,
//           revenue: 0,
//           cost: 0,
//           profit: 0,
//           invoiceCount: 0
//         };
//       }

//       // Calculate profit for this invoice
//       let invoiceCost = 0;
//       for (const item of invoice.items) {
//         if (item.productId) {
//           const purchasePrice = item.productId.purchasePrice || 0;
//           invoiceCost += purchasePrice * item.quantity;
//         }
//       }

//       groupedData[groupKey].revenue += invoice.grandTotal;
//       groupedData[groupKey].cost += invoiceCost;
//       groupedData[groupKey].profit += (invoice.grandTotal - invoiceCost);
//       groupedData[groupKey].invoiceCount += 1;
//     }

//     // Convert to array and sort
//     const result = Object.values(groupedData).map(item => ({
//       ...item,
//       profitMargin: item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0,
//       averageProfitPerInvoice: item.invoiceCount > 0 ? item.profit / item.invoiceCount : 0
//     })).sort((a, b) => a.period.localeCompare(b.period));

//     return result;
//   }
// }

// module.exports = ProfitCalculator;