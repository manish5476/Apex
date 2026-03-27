'use strict';

/**
 * ProfitCalculator
 * ─────────────────────────────────────────────
 * All profit/margin calculations for invoice analytics.
 *
 * Key fixes vs original:
 *
 * FIX #1 — Use purchasePriceAtSale (snapshotted cost at time of sale)
 *   NOT product.purchasePrice (current cost). The original used current
 *   product cost for ALL calculations, meaning any price change would
 *   retroactively alter historical profit figures. We use the snapshotted
 *   value stored on the invoice item. Falls back to current product price
 *   only when the snapshot is genuinely null/missing.
 *
 * FIX #2 — profitSummary aggregation was broken.
 *   $first: '$grandTotal' after $unwind gives the grandTotal of only the
 *   FIRST item doc per group, not the invoice total. Fixed with a two-stage
 *   aggregation that sums invoice totals correctly.
 *
 * FIX #3 — getProfitTrends ran one cost aggregation per period inside
 *   Promise.all — unbounded DB calls for large date ranges. Fixed by
 *   computing cost in a single aggregation pass alongside revenue.
 *
 * FIX #4 — calculateBulkProfit and getProfitByPeriod were called by
 *   getProfitAnalysis controller but never defined. Added both methods.
 *
 * FIX #5 — calculateAdvancedProfit $lookup to products table uses current
 *   purchasePrice. Fixed to prefer items.purchasePriceAtSale with $ifNull
 *   fallback to product.purchasePrice.
 *
 * FIX #6 — getProfitAnalysis controller loaded ALL invoices into Node.js
 *   memory. Replaced with aggregation pipeline.
 */

const mongoose = require('mongoose');
const Invoice  = require('../invoice.model');
const Product  = require('../../../inventory/core/model/product.model');

class ProfitCalculator {

  /* ============================================================
   * 1. CALCULATE PROFIT FOR A SINGLE INVOICE
   *    Used when the invoice document is already in memory.
   * ============================================================ */
  static async calculateInvoiceProfit(invoice, includeDetails = false) {
    if (!invoice?.items?.length) {
      return { revenue: 0, cost: 0, tax: 0, discount: 0, grossProfit: 0, netProfit: 0, margin: 0, items: [] };
    }

    let totalCost = 0;
    const itemProfits = [];

    for (const item of invoice.items) {
      const qty      = item.quantity || 0;
      const price    = item.price    || 0;
      const discount = item.discount || 0;
      const taxRate  = item.taxRate  || 0;

      const baseRevenue        = price * qty;
      const revenueAfterDiscount = baseRevenue - discount;
      const itemTax            = (taxRate / 100) * revenueAfterDiscount;
      const itemRevenue        = revenueAfterDiscount + itemTax;

      // FIX #1: Use snapshotted cost — not current product.purchasePrice
      let costPerUnit = null;
      if (item.purchasePriceAtSale != null) {
        costPerUnit = item.purchasePriceAtSale;
      } else if (item.productId?.purchasePrice != null) {
        // Fallback: product is populated and snapshot is missing
        costPerUnit = item.productId.purchasePrice;
      } else if (item.productId && typeof item.productId === 'object' && item.productId._id) {
        // Fallback: fetch from DB (last resort — only when not populated)
        const prod = await Product.findById(item.productId._id).select('purchasePrice').lean();
        costPerUnit = prod?.purchasePrice ?? 0;
      } else {
        costPerUnit = 0;
      }

      const itemCost       = costPerUnit * qty;
      const itemGrossProfit = revenueAfterDiscount - itemCost;
      const itemMargin     = revenueAfterDiscount > 0 ? (itemGrossProfit / revenueAfterDiscount) * 100 : 0;

      itemProfits.push({
        productId:    item.productId?._id || item.productId,
        productName:  item.name,
        sku:          item.productId?.sku || '',
        quantity:     qty,
        sellingPrice: price,
        costPrice:    costPerUnit,
        discount,
        taxRate,
        taxAmount:    itemTax,
        revenue:      itemRevenue,
        cost:         itemCost,
        grossProfit:  itemGrossProfit,
        netProfit:    itemRevenue - itemCost,
        profitMargin: itemMargin,
        markup:       itemCost > 0 ? (itemGrossProfit / itemCost) * 100 : 0,
      });

      totalCost += itemCost;
    }

    const totalRevenue  = invoice.grandTotal || 0;
    const totalTax      = invoice.totalTax   || 0;
    const totalDiscount = invoice.totalDiscount || 0;
    const grossProfit   = totalRevenue - totalTax - totalDiscount - totalCost;
    const netProfit     = totalRevenue - totalCost;
    const netRevenue    = totalRevenue - totalTax - totalDiscount;
    const margin        = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    const result = {
      revenue:     totalRevenue,
      cost:        totalCost,
      tax:         totalTax,
      discount:    totalDiscount,
      grossProfit,
      netProfit,
      margin,
      markup:      totalCost > 0 ? (grossProfit / totalCost) * 100 : 0,
    };

    if (includeDetails) result.items = itemProfits;
    return result;
  }

  /* ============================================================
   * 2. CALCULATE BULK PROFIT (array of invoice docs already fetched)
   *    FIX #4: Was called by controller but never defined.
   * ============================================================ */
  static async calculateBulkProfit(invoices) {
    if (!invoices?.length) {
      return { summary: this.getEmptySummary(), productAnalysis: [] };
    }

    let totalRevenue  = 0;
    let totalCost     = 0;
    let totalTax      = 0;
    let totalDiscount = 0;
    const productMap  = new Map();

    for (const invoice of invoices) {
      totalRevenue  += invoice.grandTotal    || 0;
      totalTax      += invoice.totalTax      || 0;
      totalDiscount += invoice.totalDiscount || 0;

      for (const item of invoice.items || []) {
        const qty      = item.quantity || 0;
        const price    = item.price    || 0;
        const discount = item.discount || 0;
        const taxRate  = item.taxRate  || 0;

        // FIX #1: prefer snapshotted cost
        const costPerUnit = item.purchasePriceAtSale ?? item.productId?.purchasePrice ?? 0;
        const itemCost    = costPerUnit * qty;
        const itemRevenue = price * qty - discount + ((taxRate / 100) * (price * qty - discount));

        totalCost += itemCost;

        const pid = String(item.productId?._id || item.productId || 'unknown');
        if (!productMap.has(pid)) {
          productMap.set(pid, {
            productId:     item.productId?._id || item.productId,
            productName:   item.name,
            sku:           item.productId?.sku || '',
            totalQuantity: 0,
            totalRevenue:  0,
            totalCost:     0,
          });
        }
        const p = productMap.get(pid);
        p.totalQuantity += qty;
        p.totalRevenue  += itemRevenue;
        p.totalCost     += itemCost;
      }
    }

    const grossProfit  = totalRevenue - totalTax - totalDiscount - totalCost;
    const netRevenue   = totalRevenue - totalTax - totalDiscount;
    const profitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    const productAnalysis = Array.from(productMap.values()).map(p => {
      const gp     = p.totalRevenue - p.totalCost;
      const margin = p.totalRevenue > 0 ? (gp / p.totalRevenue) * 100 : 0;
      return {
        ...p,
        grossProfit:         gp,
        netProfit:           gp,
        profitMargin:        margin,
        markup:              p.totalCost > 0 ? (gp / p.totalCost) * 100 : 0,
        averageSellingPrice: p.totalQuantity > 0 ? p.totalRevenue / p.totalQuantity : 0,
        averageCostPrice:    p.totalQuantity > 0 ? p.totalCost    / p.totalQuantity : 0,
        profitPerUnit:       p.totalQuantity > 0 ? gp             / p.totalQuantity : 0,
        totalProfit:         gp,
      };
    }).sort((a, b) => b.grossProfit - a.grossProfit);

    return {
      summary: {
        ...this.getEmptySummary(),
        totalInvoices:              invoices.length,
        totalRevenue,
        totalCost,
        totalTax,
        totalDiscount,
        grossProfit,
        netProfit:                  totalRevenue - totalCost,
        profitMargin,
        markup:                     totalCost > 0 ? (grossProfit / totalCost) * 100 : 0,
        averageRevenuePerInvoice:   invoices.length > 0 ? totalRevenue  / invoices.length : 0,
        averageProfitPerInvoice:    invoices.length > 0 ? grossProfit   / invoices.length : 0,
      },
      productAnalysis,
    };
  }

  /* ============================================================
   * 3. GET PROFIT BY PERIOD (alias used by getProfitAnalysis)
   *    FIX #4: Was called but never defined.
   * ============================================================ */
  static async getProfitByPeriod(orgId, startDate, endDate, groupBy = 'day') {
    return this.getProfitTrends(orgId, { startDate, endDate }, groupBy);
  }

  /* ============================================================
   * 4. BUILD PROFIT QUERY (filter → MongoDB match object)
   * ============================================================ */
  static buildProfitQuery(filters = {}) {
    const {
      organizationId,
      startDate, endDate,
      branchId, customerId,
      status = ['issued', 'paid'],
      paymentStatus,
      minAmount, maxAmount,
      productId, gstType,
    } = filters;

    const match = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      isDeleted:      { $ne: true },
    };

    if (status?.length)  match.status = { $in: Array.isArray(status) ? status : [status] };
    if (startDate || endDate) {
      match.invoiceDate = {};
      if (startDate) match.invoiceDate.$gte = new Date(startDate);
      if (endDate)   match.invoiceDate.$lte = new Date(endDate);
    }
    if (branchId  && branchId  !== 'all') match.branchId  = new mongoose.Types.ObjectId(branchId);
    if (customerId && customerId !== 'all') match.customerId = new mongoose.Types.ObjectId(customerId);
    if (paymentStatus && paymentStatus !== 'all') match.paymentStatus = paymentStatus;
    if (minAmount !== undefined || maxAmount !== undefined) {
      match.grandTotal = {};
      if (minAmount !== undefined) match.grandTotal.$gte = Number(minAmount);
      if (maxAmount !== undefined) match.grandTotal.$lte = Number(maxAmount);
    }
    if (productId && productId !== 'all') match['items.productId'] = new mongoose.Types.ObjectId(productId);
    if (gstType   && gstType   !== 'all') match.gstType = gstType;

    return match;
  }

  /* ============================================================
   * 5. CALCULATE ADVANCED PROFIT (aggregation-based)
   *
   *    FIX #1: Prefers items.purchasePriceAtSale via $ifNull.
   *    FIX #5: Falls back to product.purchasePrice only when snapshot is null.
   * ============================================================ */
  static async calculateAdvancedProfit(filters = {}) {
    const match = this.buildProfitQuery(filters);

    const result = await Invoice.aggregate([
      { $match: match },

      // FIX #2: Two-stage revenue calc — get invoice-level totals BEFORE unwinding
      {
        $group: {
          _id:           '$_id',
          grandTotal:    { $first: '$grandTotal' },
          totalTax:      { $first: '$totalTax' },
          totalDiscount: { $first: '$totalDiscount' },
          items:         { $first: '$items' },
        },
      },

      { $unwind: '$items' },

      // FIX #5: $lookup for fallback cost only — prefer purchasePriceAtSale
      {
        $lookup: {
          from:         'products',
          localField:   'items.productId',
          foreignField: '_id',
          as:           'productDoc',
        },
      },
      {
        $addFields: {
          productDoc: { $arrayElemAt: ['$productDoc', 0] },
        },
      },
      {
        $addFields: {
          // FIX #1: Use snapshotted cost first, fall back to current product price
          resolvedCostPerUnit: {
            $ifNull: [
              '$items.purchasePriceAtSale',
              { $ifNull: ['$productDoc.purchasePrice', 0] },
            ],
          },
        },
      },

      // Group back at invoice level to calculate per-invoice totals
      {
        $group: {
          _id:           '$_id',
          grandTotal:    { $first: '$grandTotal' },
          totalTax:      { $first: '$totalTax' },
          totalDiscount: { $first: '$totalDiscount' },
          itemCostTotal: {
            $sum: { $multiply: ['$resolvedCostPerUnit', '$items.quantity'] },
          },
          itemCount: { $sum: '$items.quantity' },
          productEntries: {
            $push: {
              productId:   '$items.productId',
              productName: '$items.name',
              sku:         '$productDoc.sku',
              quantity:    '$items.quantity',
              price:       '$items.price',
              discount:    { $ifNull: ['$items.discount', 0] },
              taxRate:     { $ifNull: ['$items.taxRate', 0] },
              costPerUnit: '$resolvedCostPerUnit',
            },
          },
        },
      },

      // Final summary group
      {
        $group: {
          _id:           null,
          totalInvoices: { $sum: 1 },
          totalRevenue:  { $sum: '$grandTotal' },
          totalTax:      { $sum: '$totalTax' },
          totalDiscount: { $sum: '$totalDiscount' },
          totalCost:     { $sum: '$itemCostTotal' },
          totalQuantity: { $sum: '$itemCount' },
          productEntries: { $push: '$productEntries' },
        },
      },

      {
        $project: {
          _id:           0,
          totalInvoices: 1,
          totalRevenue:  1,
          totalTax:      1,
          totalDiscount: 1,
          totalCost:     1,
          totalQuantity: 1,
          grossProfit: {
            $subtract: [
              { $subtract: ['$totalRevenue', '$totalTax'] },
              { $add: ['$totalCost', '$totalDiscount'] },
            ],
          },
          productEntries: 1,
        },
      },
    ]);

    if (!result.length) {
      return { summary: this.getEmptySummary(), productAnalysis: [] };
    }

    const data        = result[0];
    const grossProfit = data.grossProfit || 0;
    const netRevenue  = data.totalRevenue - data.totalTax - data.totalDiscount;
    const profitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
    const markup      = data.totalCost  > 0 ? (grossProfit / data.totalCost) * 100 : 0;

    // Flatten and aggregate product entries
    const productMap = new Map();
    const allEntries = data.productEntries.flat();

    for (const p of allEntries) {
      if (!p.productId) continue;
      const key = p.productId.toString();
      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: p.productId, productName: p.productName, sku: p.sku,
          totalQuantity: 0, totalRevenue: 0, totalCost: 0,
          totalTax: 0, totalDiscount: 0,
        });
      }
      const entry      = productMap.get(key);
      const itemRev    = p.price * p.quantity;
      const itemDisc   = p.discount || 0;
      const itemTax    = ((p.taxRate || 0) / 100) * (itemRev - itemDisc);
      const itemCost   = (p.costPerUnit || 0) * p.quantity;

      entry.totalQuantity += p.quantity;
      entry.totalRevenue  += itemRev;
      entry.totalCost     += itemCost;
      entry.totalTax      += itemTax;
      entry.totalDiscount += itemDisc;
    }

    const productAnalysis = Array.from(productMap.values()).map(p => {
      const gp     = p.totalRevenue - p.totalCost - p.totalDiscount;
      const margin = p.totalRevenue > 0 ? (gp / p.totalRevenue) * 100 : 0;
      return {
        ...p,
        grossProfit:         gp,
        netProfit:           p.totalRevenue - p.totalCost,
        profitMargin:        margin,
        markup:              p.totalCost > 0 ? (gp / p.totalCost) * 100 : 0,
        averageSellingPrice: p.totalQuantity > 0 ? p.totalRevenue  / p.totalQuantity : 0,
        averageCostPrice:    p.totalQuantity > 0 ? p.totalCost     / p.totalQuantity : 0,
        profitPerUnit:       p.totalQuantity > 0 ? gp              / p.totalQuantity : 0,
        totalProfit:         gp,
      };
    }).sort((a, b) => b.grossProfit - a.grossProfit);

    return {
      summary: {
        totalInvoices:            data.totalInvoices,
        totalRevenue:             data.totalRevenue,
        totalCost:                data.totalCost,
        totalTax:                 data.totalTax,
        totalDiscount:            data.totalDiscount,
        totalQuantity:            data.totalQuantity,
        grossProfit,
        netProfit:                data.totalRevenue - data.totalCost,
        profitMargin,
        markup,
        averageRevenuePerInvoice: data.totalInvoices > 0 ? data.totalRevenue / data.totalInvoices : 0,
        averageProfitPerInvoice:  data.totalInvoices > 0 ? grossProfit       / data.totalInvoices : 0,
        averageItemsPerInvoice:   data.totalInvoices > 0 ? data.totalQuantity / data.totalInvoices : 0,
      },
      productAnalysis,
    };
  }

  /* ============================================================
   * 6. GET PROFIT TRENDS
   *
   *    FIX #3: Original ran a separate cost aggregation per period
   *    inside Promise.all — unbounded DB calls. Fixed with a single
   *    aggregation that computes revenue AND cost together.
   * ============================================================ */
  static async getProfitTrends(orgId, filters = {}, groupBy = 'day') {
    const match = this.buildProfitQuery({ organizationId: orgId, ...filters });

    // Build the group _id based on groupBy
    const groupId = this._buildGroupId(groupBy);

    const trends = await Invoice.aggregate([
      { $match: match },

      // Get invoice totals before unwinding
      {
        $group: {
          _id:        '$_id',
          invoiceDate: { $first: '$invoiceDate' },
          grandTotal: { $first: '$grandTotal' },
          items:      { $first: '$items' },
        },
      },

      { $unwind: '$items' },

      {
        $lookup: {
          from: 'products', localField: 'items.productId',
          foreignField: '_id', as: 'productDoc',
        },
      },
      { $addFields: { productDoc: { $arrayElemAt: ['$productDoc', 0] } } },
      {
        $addFields: {
          resolvedCost: {
            $multiply: [
              {
                $ifNull: [
                  '$items.purchasePriceAtSale',
                  { $ifNull: ['$productDoc.purchasePrice', 0] },
                ],
              },
              '$items.quantity',
            ],
          },
        },
      },

      // Re-group per invoice to get per-invoice cost
      {
        $group: {
          _id:         '$_id',
          invoiceDate: { $first: '$invoiceDate' },
          grandTotal:  { $first: '$grandTotal' },
          invoiceCost: { $sum: '$resolvedCost' },
          itemCount:   { $sum: '$items.quantity' },
        },
      },

      // Group by period
      {
        $group: {
          _id:          groupId,
          revenue:      { $sum: '$grandTotal' },
          cost:         { $sum: '$invoiceCost' },
          invoiceCount: { $sum: 1 },
          itemCount:    { $sum: '$itemCount' },
        },
      },

      { $sort: { _id: 1 } },

      {
        $project: {
          _id:        0,
          period:     '$_id',
          revenue:    { $round: ['$revenue', 2] },
          cost:       { $round: ['$cost', 2] },
          profit:     { $round: [{ $subtract: ['$revenue', '$cost'] }, 2] },
          margin: {
            $cond: {
              if:   { $gt: ['$revenue', 0] },
              then: { $round: [{ $multiply: [{ $divide: [{ $subtract: ['$revenue', '$cost'] }, '$revenue'] }, 100] }, 2] },
              else: 0,
            },
          },
          invoiceCount: 1,
          itemCount:    1,
          averageOrderValue: {
            $cond: {
              if:   { $gt: ['$invoiceCount', 0] },
              then: { $round: [{ $divide: ['$revenue', '$invoiceCount'] }, 2] },
              else: 0,
            },
          },
        },
      },
    ]);

    return trends;
  }

  /* ============================================================
   * 7. CUSTOMER PROFITABILITY
   * ============================================================ */
  static async getCustomerProfitability(orgId, filters = {}, limit = 20) {
    const match = this.buildProfitQuery({ organizationId: orgId, ...filters });

    return Invoice.aggregate([
      { $match: match },
      {
        $group: {
          _id:          '$_id',
          customerId:   { $first: '$customerId' },
          grandTotal:   { $first: '$grandTotal' },
          items:        { $first: '$items' },
        },
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products', localField: 'items.productId',
          foreignField: '_id', as: 'productDoc',
        },
      },
      { $addFields: { productDoc: { $arrayElemAt: ['$productDoc', 0] } } },
      {
        $addFields: {
          itemCost: {
            $multiply: [
              { $ifNull: ['$items.purchasePriceAtSale', { $ifNull: ['$productDoc.purchasePrice', 0] }] },
              '$items.quantity',
            ],
          },
        },
      },
      {
        $group: {
          _id:          '$_id',
          customerId:   { $first: '$customerId' },
          grandTotal:   { $first: '$grandTotal' },
          invoiceCost:  { $sum: '$itemCost' },
          itemCount:    { $sum: '$items.quantity' },
        },
      },
      {
        $group: {
          _id:           '$customerId',
          totalInvoices: { $sum: 1 },
          totalRevenue:  { $sum: '$grandTotal' },
          totalCost:     { $sum: '$invoiceCost' },
          totalQuantity: { $sum: '$itemCount' },
        },
      },
      {
        $project: {
          customerId:      '$_id',
          totalInvoices:   1,
          totalRevenue:    { $round: ['$totalRevenue', 2] },
          totalCost:       { $round: ['$totalCost', 2] },
          totalQuantity:   1,
          totalProfit:     { $round: [{ $subtract: ['$totalRevenue', '$totalCost'] }, 2] },
          profitMargin: {
            $cond: {
              if:   { $gt: ['$totalRevenue', 0] },
              then: { $round: [{ $multiply: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCost'] }, '$totalRevenue'] }, 100] }, 2] },
              else: 0,
            },
          },
          averageOrderValue: {
            $cond: {
              if:   { $gt: ['$totalInvoices', 0] },
              then: { $round: [{ $divide: ['$totalRevenue', '$totalInvoices'] }, 2] },
              else: 0,
            },
          },
        },
      },
      { $sort:  { totalProfit: -1 } },
      { $limit: limit },
    ]);
  }

  /* ============================================================
   * 8. CATEGORY PROFITABILITY
   * ============================================================ */
  static async getCategoryProfitability(orgId, filters = {}) {
    const match = this.buildProfitQuery({ organizationId: orgId, ...filters });

    return Invoice.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products', localField: 'items.productId',
          foreignField: '_id', as: 'productDoc',
        },
      },
      { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: false } },
      {
        $addFields: {
          itemRevenue: { $multiply: ['$items.price', '$items.quantity'] },
          itemCost: {
            $multiply: [
              { $ifNull: ['$items.purchasePriceAtSale', { $ifNull: ['$productDoc.purchasePrice', 0] }] },
              '$items.quantity',
            ],
          },
        },
      },
      {
        $group: {
          _id:          '$productDoc.categoryId',
          category:     { $first: '$productDoc.categoryId' },
          totalRevenue: { $sum: '$itemRevenue' },
          totalCost:    { $sum: '$itemCost' },
          totalQuantity: { $sum: '$items.quantity' },
          productCount: { $addToSet: '$productDoc._id' },
        },
      },
      {
        $project: {
          category:     1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          totalCost:    { $round: ['$totalCost',    2] },
          totalQuantity: 1,
          totalProfit: { $round: [{ $subtract: ['$totalRevenue', '$totalCost'] }, 2] },
          profitMargin: {
            $cond: {
              if:   { $gt: ['$totalRevenue', 0] },
              then: { $round: [{ $multiply: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCost'] }, '$totalRevenue'] }, 100] }, 2] },
              else: 0,
            },
          },
          uniqueProducts: { $size: '$productCount' },
        },
      },
      { $sort: { totalProfit: -1 } },
    ]);
  }

  /* ============================================================
   * PRIVATE HELPERS
   * ============================================================ */

  static _buildGroupId(groupBy) {
    switch (groupBy) {
      case 'hour':
        return {
          year:  { $year:        '$invoiceDate' },
          month: { $month:       '$invoiceDate' },
          day:   { $dayOfMonth:  '$invoiceDate' },
          hour:  { $hour:        '$invoiceDate' },
        };
      case 'week':
        return {
          year: { $year: '$invoiceDate' },
          week: { $week: '$invoiceDate' },
        };
      case 'month':
        return {
          year:  { $year:  '$invoiceDate' },
          month: { $month: '$invoiceDate' },
        };
      case 'quarter':
        return {
          year:    { $year: '$invoiceDate' },
          quarter: { $ceil: { $divide: [{ $month: '$invoiceDate' }, 3] } },
        };
      case 'year':
        return { year: { $year: '$invoiceDate' } };
      default: // day
        return { date: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } } };
    }
  }

  static getEmptySummary() {
    return {
      totalInvoices: 0, totalRevenue: 0, totalCost: 0,
      totalTax: 0, totalDiscount: 0, totalQuantity: 0,
      grossProfit: 0, netProfit: 0, profitMargin: 0, markup: 0,
      averageRevenuePerInvoice: 0, averageProfitPerInvoice: 0, averageItemsPerInvoice: 0,
    };
  }
}

module.exports = ProfitCalculator;


// // utils/profitCalculator.js
  // const mongoose = require('mongoose');
  // const Product = require("../../../inventory/core/model/product.model");
  // const Invoice = require("../invoice.model");
  // class ProfitCalculator {
  //   /**
  //    * Enhanced profit calculation with tax, discount considerations
  //    */
  //   static async calculateInvoiceProfit(invoice, includeDetails = false) {
  //     if (!invoice || !invoice.items || invoice.items.length === 0) {
  //       return {
  //         revenue: 0,
  //         cost: 0,
  //         tax: 0,
  //         discount: 0,
  //         netProfit: 0,
  //         grossProfit: 0,
  //         margin: 0,
  //         items: []
  //       };
  //     }

  //     let totalRevenue = invoice.grandTotal || 0;
  //     let totalTax = invoice.totalTax || 0;
  //     let totalDiscount = invoice.totalDiscount || 0;
  //     let totalCost = 0;
  //     const itemProfits = [];

  //     // Calculate profit for each item with proper tax allocation
  //     for (const item of invoice.items) {
  //       let itemCost = 0;
  //       let itemRevenue = 0;
  //       let itemTax = 0;
        
  //       // Calculate base revenue before discount
  //       const baseRevenue = item.price * item.quantity;
  //       const itemDiscount = item.discount || 0;
  //       const revenueAfterDiscount = baseRevenue - itemDiscount;
        
  //       // Calculate tax on the discounted amount
  //       itemTax = (item.taxRate || 0) / 100 * revenueAfterDiscount;
        
  //       if (item.productId) {
  //         // If product is populated
  //         const product = item.productId;
  //         itemCost = (product.purchasePrice || 0) * item.quantity;
  //         itemRevenue = revenueAfterDiscount + itemTax;
  //       } else {
  //         // If product is not populated, fetch it
  //         const product = await Product.findById(item.productId).lean();
  //         if (product) {
  //           itemCost = (product.purchasePrice || 0) * item.quantity;
  //           itemRevenue = revenueAfterDiscount + itemTax;
  //         } else {
  //           itemCost = 0;
  //           itemRevenue = revenueAfterDiscount + itemTax;
  //         }
  //       }

  //       const itemGrossProfit = revenueAfterDiscount - itemCost;
  //       const itemNetProfit = itemRevenue - itemCost;
  //       const itemMargin = revenueAfterDiscount > 0 ? (itemGrossProfit / revenueAfterDiscount) * 100 : 0;

  //       itemProfits.push({
  //         productId: item.productId?._id || item.productId,
  //         productName: item.name,
  //         sku: item.productId?.sku || '',
  //         quantity: item.quantity,
  //         sellingPrice: item.price,
  //         costPrice: itemCost / item.quantity,
  //         discount: itemDiscount,
  //         taxRate: item.taxRate || 0,
  //         taxAmount: itemTax,
  //         revenue: itemRevenue,
  //         cost: itemCost,
  //         grossProfit: itemGrossProfit,
  //         netProfit: itemNetProfit,
  //         profitMargin: itemMargin,
  //         markup: itemCost > 0 ? (itemGrossProfit / itemCost) * 100 : 0
  //       });

  //       totalCost += itemCost;
  //     }

  //     const grossProfit = totalRevenue - totalTax - totalDiscount - totalCost;
  //     const netProfit = totalRevenue - totalCost;
  //     const profitMargin = (totalRevenue - totalTax - totalDiscount) > 0 
  //       ? (grossProfit / (totalRevenue - totalTax - totalDiscount)) * 100 
  //       : 0;

  //     const result = {
  //       revenue: totalRevenue,
  //       cost: totalCost,
  //       tax: totalTax,
  //       discount: totalDiscount,
  //       grossProfit,
  //       netProfit,
  //       margin: profitMargin,
  //       markup: totalCost > 0 ? (grossProfit / totalCost) * 100 : 0
  //     };

  //     if (includeDetails) {
  //       result.items = itemProfits;
  //     }

  //     return result;
  //   }

  //   /**
  //    * Advanced filtering capabilities
  //    */
  //   static buildProfitQuery(filters = {}) {
  //     const {
  //       organizationId,
  //       startDate,
  //       endDate,
  //       branchId,
  //       customerId,
  //       status = ['issued', 'paid'],
  //       paymentStatus,
  //       minAmount,
  //       maxAmount,
  //       productId,
  //       category,
  //       gstType
  //     } = filters;

  //     const match = {
  //       organizationId: new mongoose.Types.ObjectId(organizationId),
  //       isDeleted: { $ne: true }
  //     };

  //     // Status filter
  //     if (status && status.length > 0) {
  //       match.status = { $in: status };
  //     }

  //     // Date range filter
  //     if (startDate || endDate) {
  //       match.invoiceDate = {};
  //       if (startDate) match.invoiceDate.$gte = new Date(startDate);
  //       if (endDate) match.invoiceDate.$lte = new Date(endDate);
  //     }

  //     // Branch filter
  //     if (branchId && branchId !== 'all') {
  //       match.branchId = new mongoose.Types.ObjectId(branchId);
  //     }

  //     // Customer filter
  //     if (customerId && customerId !== 'all') {
  //       match.customerId = new mongoose.Types.ObjectId(customerId);
  //     }

  //     // Payment status filter
  //     if (paymentStatus && paymentStatus !== 'all') {
  //       match.paymentStatus = paymentStatus;
  //     }

  //     // Amount range filter
  //     if (minAmount !== undefined || maxAmount !== undefined) {
  //       match.grandTotal = {};
  //       if (minAmount !== undefined) match.grandTotal.$gte = Number(minAmount);
  //       if (maxAmount !== undefined) match.grandTotal.$lte = Number(maxAmount);
  //     }

  //     // Product filter
  //     if (productId && productId !== 'all') {
  //       match['items.productId'] = new mongoose.Types.ObjectId(productId);
  //     }

  //     // GST type filter
  //     if (gstType && gstType !== 'all') {
  //       match.gstType = gstType;
  //     }

  //     return match;
  //   }

  //   /**
  //    * Enhanced bulk profit calculation with advanced aggregation
  //    */
  //   static async calculateAdvancedProfit(filters = {}) {
  //     const match = this.buildProfitQuery(filters);
      
  //     // Use MongoDB aggregation for better performance
  //     const aggregation = [
  //       { $match: match },
  //       { $unwind: '$items' },
  //       {
  //         $lookup: {
  //           from: 'products',
  //           localField: 'items.productId',
  //           foreignField: '_id',
  //           as: 'product'
  //         }
  //       },
  //       { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
  //       {
  //         $group: {
  //           _id: null,
  //           totalInvoices: { $sum: 1 },
  //           totalRevenue: { $sum: '$grandTotal' },
  //           totalTax: { $sum: '$totalTax' },
  //           totalDiscount: { $sum: '$totalDiscount' },
  //           totalQuantity: { $sum: '$items.quantity' },
            
  //           // Cost calculation
  //           totalCost: {
  //             $sum: {
  //               $multiply: [
  //                 { $ifNull: ['$product.purchasePrice', 0] },
  //                 '$items.quantity'
  //               ]
  //             }
  //           },
            
  //           // Product-level aggregation
  //           products: {
  //             $push: {
  //               productId: '$product._id',
  //               productName: '$items.name',
  //               sku: '$product.sku',
  //               quantity: '$items.quantity',
  //               sellingPrice: '$items.price',
  //               costPrice: { $ifNull: ['$product.purchasePrice', 0] },
  //               taxRate: '$items.taxRate',
  //               discount: '$items.discount',
  //               revenue: {
  //                 $multiply: ['$items.price', '$items.quantity']
  //               }
  //             }
  //           }
  //         }
  //       },
  //       {
  //         $project: {
  //           totalInvoices: 1,
  //           totalRevenue: 1,
  //           totalTax: 1,
  //           totalDiscount: 1,
  //           totalCost: 1,
  //           totalQuantity: 1,
  //           grossProfit: {
  //             $subtract: [
  //               { $subtract: ['$totalRevenue', '$totalTax'] },
  //               { $add: ['$totalCost', '$totalDiscount'] }
  //             ]
  //           },
  //           products: 1
  //         }
  //       }
  //     ];

  //     const result = await Invoice.aggregate(aggregation);
      
  //     if (result.length === 0) {
  //       return {
  //         summary: this.getEmptySummary(),
  //         productAnalysis: []
  //       };
  //     }

  //     const data = result[0];
  //     const grossProfit = data.grossProfit || 0;
  //     const revenueAfterTax = data.totalRevenue - data.totalTax;
  //     const profitMargin = revenueAfterTax > 0 
  //       ? (grossProfit / revenueAfterTax) * 100 
  //       : 0;
  //     const markup = data.totalCost > 0 ? (grossProfit / data.totalCost) * 100 : 0;

  //     // Process product-level data
  //     const productMap = new Map();
  //     data.products.forEach(p => {
  //       if (!p.productId) return;
        
  //       const key = p.productId.toString();
  //       if (!productMap.has(key)) {
  //         productMap.set(key, {
  //           productId: p.productId,
  //           productName: p.productName,
  //           sku: p.sku,
  //           totalQuantity: 0,
  //           totalRevenue: 0,
  //           totalCost: 0,
  //           totalTax: 0,
  //           totalDiscount: 0
  //         });
  //       }
        
  //       const product = productMap.get(key);
  //       const itemRevenue = p.revenue || (p.sellingPrice * p.quantity);
  //       const itemCost = (p.costPrice || 0) * p.quantity;
  //       const itemTax = (itemRevenue * (p.taxRate || 0)) / 100;
  //       const itemDiscount = p.discount || 0;
        
  //       product.totalQuantity += p.quantity;
  //       product.totalRevenue += itemRevenue;
  //       product.totalCost += itemCost;
  //       product.totalTax += itemTax;
  //       product.totalDiscount += itemDiscount;
  //     });

  //     const productAnalysis = Array.from(productMap.values()).map(p => {
  //       const grossProfit = p.totalRevenue - p.totalCost - p.totalDiscount;
  //       const netProfit = p.totalRevenue - p.totalCost;
  //       return {
  //         ...p,
  //         grossProfit,
  //         netProfit,
  //         profitMargin: p.totalRevenue > 0 ? (grossProfit / p.totalRevenue) * 100 : 0,
  //         markup: p.totalCost > 0 ? (grossProfit / p.totalCost) * 100 : 0,
  //         averageSellingPrice: p.totalQuantity > 0 ? p.totalRevenue / p.totalQuantity : 0,
  //         averageCostPrice: p.totalQuantity > 0 ? p.totalCost / p.totalQuantity : 0,
  //         profitPerUnit: p.totalQuantity > 0 ? grossProfit / p.totalQuantity : 0
  //       };
  //     }).sort((a, b) => b.grossProfit - a.grossProfit);

  //     return {
  //       summary: {
  //         totalInvoices: data.totalInvoices,
  //         totalRevenue: data.totalRevenue,
  //         totalCost: data.totalCost,
  //         totalTax: data.totalTax,
  //         totalDiscount: data.totalDiscount,
  //         totalQuantity: data.totalQuantity,
  //         grossProfit,
  //         netProfit: data.totalRevenue - data.totalCost,
  //         profitMargin,
  //         markup,
  //         averageRevenuePerInvoice: data.totalInvoices > 0 ? data.totalRevenue / data.totalInvoices : 0,
  //         averageProfitPerInvoice: data.totalInvoices > 0 ? grossProfit / data.totalInvoices : 0,
  //         averageItemsPerInvoice: data.totalInvoices > 0 ? data.totalQuantity / data.totalInvoices : 0
  //       },
  //       productAnalysis
  //     };
  //   }

  //   /**
  //    * Get profit trends with multiple grouping options
  //    */
  //   static async getProfitTrends(orgId, filters = {}, groupBy = 'day') {
  //     const match = this.buildProfitQuery({ organizationId: orgId, ...filters });
      
  //     let groupStage;
  //     let sortStage = { _id: 1 };
      
  //     switch (groupBy) {
  //       case 'hour':
  //         groupStage = {
  //           $group: {
  //             _id: {
  //               year: { $year: '$invoiceDate' },
  //               month: { $month: '$invoiceDate' },
  //               day: { $dayOfMonth: '$invoiceDate' },
  //               hour: { $hour: '$invoiceDate' }
  //             },
  //             revenue: { $sum: '$grandTotal' },
  //             invoiceCount: { $sum: 1 },
  //             itemCount: { $sum: { $size: '$items' } }
  //           }
  //         };
  //         break;
          
  //       case 'day':
  //         groupStage = {
  //           $group: {
  //             _id: {
  //               date: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } }
  //             },
  //             revenue: { $sum: '$grandTotal' },
  //             invoiceCount: { $sum: 1 },
  //             itemCount: { $sum: { $size: '$items' } }
  //           }
  //         };
  //         sortStage = { '_id.date': 1 };
  //         break;
          
  //       case 'week':
  //         groupStage = {
  //           $group: {
  //             _id: {
  //               year: { $year: '$invoiceDate' },
  //               week: { $week: '$invoiceDate' }
  //             },
  //             revenue: { $sum: '$grandTotal' },
  //             invoiceCount: { $sum: 1 },
  //             itemCount: { $sum: { $size: '$items' } }
  //           }
  //         };
  //         break;
          
  //       case 'month':
  //         groupStage = {
  //           $group: {
  //             _id: {
  //               year: { $year: '$invoiceDate' },
  //               month: { $month: '$invoiceDate' }
  //             },
  //             revenue: { $sum: '$grandTotal' },
  //             invoiceCount: { $sum: 1 },
  //             itemCount: { $sum: { $size: '$items' } }
  //           }
  //         };
  //         break;
          
  //       case 'quarter':
  //         groupStage = {
  //           $group: {
  //             _id: {
  //               year: { $year: '$invoiceDate' },
  //               quarter: {
  //                 $ceil: { $divide: [{ $month: '$invoiceDate' }, 3] }
  //               }
  //             },
  //             revenue: { $sum: '$grandTotal' },
  //             invoiceCount: { $sum: 1 },
  //             itemCount: { $sum: { $size: '$items' } }
  //           }
  //         };
  //         break;
          
  //       case 'year':
  //         groupStage = {
  //           $group: {
  //             _id: { $year: '$invoiceDate' },
  //             revenue: { $sum: '$grandTotal' },
  //             invoiceCount: { $sum: 1 },
  //             itemCount: { $sum: { $size: '$items' } }
  //           }
  //         };
  //         break;
          
  //       default:
  //         groupStage = {
  //           $group: {
  //             _id: {
  //               date: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } }
  //             },
  //             revenue: { $sum: '$grandTotal' },
  //             invoiceCount: { $sum: 1 },
  //             itemCount: { $sum: { $size: '$items' } }
  //           }
  //         };
  //     }

  //     const aggregation = [
  //       { $match: match },
  //       groupStage,
  //       { $sort: sortStage }
  //     ];

  //     const trends = await Invoice.aggregate(aggregation);
      
  //     // We'll need to calculate cost separately for each period
  //     const trendsWithCost = await Promise.all(
  //       trends.map(async (trend) => {
  //         let periodFilter = { ...filters, organizationId: orgId };
          
  //         // Add date filter based on period
  //         if (groupBy === 'day' && trend._id.date) {
  //           const date = new Date(trend._id.date);
  //           periodFilter.startDate = date;
  //           periodFilter.endDate = new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
  //         }
          
  //         const periodMatch = this.buildProfitQuery(periodFilter);
  //         const costAggregation = [
  //           { $match: periodMatch },
  //           { $unwind: '$items' },
  //           {
  //             $lookup: {
  //               from: 'products',
  //               localField: 'items.productId',
  //               foreignField: '_id',
  //               as: 'product'
  //             }
  //           },
  //           { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
  //           {
  //             $group: {
  //               _id: null,
  //               totalCost: {
  //                 $sum: {
  //                   $multiply: [
  //                     { $ifNull: ['$product.purchasePrice', 0] },
  //                     '$items.quantity'
  //                   ]
  //                 }
  //               }
  //             }
  //           }
  //         ];
          
  //         const costResult = await Invoice.aggregate(costAggregation);
  //         const totalCost = costResult[0]?.totalCost || 0;
  //         const profit = trend.revenue - totalCost;
  //         const margin = trend.revenue > 0 ? (profit / trend.revenue) * 100 : 0;
          
  //         return {
  //           period: groupBy === 'day' ? trend._id.date : 
  //                   groupBy === 'week' ? `Week ${trend._id.week}, ${trend._id.year}` :
  //                   groupBy === 'month' ? `${trend._id.year}-${String(trend._id.month).padStart(2, '0')}` :
  //                   groupBy === 'quarter' ? `Q${trend._id.quarter} ${trend._id.year}` :
  //                   groupBy === 'year' ? trend._id.toString() :
  //                   trend._id,
  //           revenue: trend.revenue,
  //           cost: totalCost,
  //           profit,
  //           margin,
  //           invoiceCount: trend.invoiceCount,
  //           itemCount: trend.itemCount,
  //           averageOrderValue: trend.invoiceCount > 0 ? trend.revenue / trend.invoiceCount : 0
  //         };
  //       })
  //     );

  //     return trendsWithCost;
  //   }

  //   /**
  //    * Customer profitability analysis
  //    */
  //   static async getCustomerProfitability(orgId, filters = {}, limit = 20) {
  //     const match = this.buildProfitQuery({ organizationId: orgId, ...filters });
      
  //     const aggregation = [
  //       { $match: match },
  //       { $unwind: '$items' },
  //       {
  //         $lookup: {
  //           from: 'products',
  //           localField: 'items.productId',
  //           foreignField: '_id',
  //           as: 'product'
  //         }
  //       },
  //       { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
  //       {
  //         $group: {
  //           _id: '$customerId',
  //           customerName: { $first: '$customerId' }, // This will be populated later
  //           totalInvoices: { $sum: 1 },
  //           totalRevenue: { $sum: '$grandTotal' },
  //           totalQuantity: { $sum: '$items.quantity' },
  //           totalCost: {
  //             $sum: {
  //               $multiply: [
  //                 { $ifNull: ['$product.purchasePrice', 0] },
  //                 '$items.quantity'
  //               ]
  //             }
  //           }
  //         }
  //       },
  //       {
  //         $project: {
  //           customerId: '$_id',
  //           customerName: 1,
  //           totalInvoices: 1,
  //           totalRevenue: 1,
  //           totalCost: 1,
  //           totalQuantity: 1,
  //           totalProfit: { $subtract: ['$totalRevenue', '$totalCost'] },
  //           profitMargin: {
  //             $cond: [
  //               { $gt: ['$totalRevenue', 0] },
  //               { $multiply: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCost'] }, '$totalRevenue'] }, 100] },
  //               0
  //             ]
  //           },
  //           averageOrderValue: {
  //             $cond: [
  //               { $gt: ['$totalInvoices', 0] },
  //               { $divide: ['$totalRevenue', '$totalInvoices'] },
  //               0
  //             ]
  //           }
  //         }
  //       },
  //       { $sort: { totalProfit: -1 } },
  //       { $limit: limit }
  //     ];

  //     return await Invoice.aggregate(aggregation);
  //   }

  //   /**
  //    * Category-wise profit analysis
  //    */
  //   static async getCategoryProfitability(orgId, filters = {}) {
  //     const match = this.buildProfitQuery({ organizationId: orgId, ...filters });
      
  //     const aggregation = [
  //       { $match: match },
  //       { $unwind: '$items' },
  //       {
  //         $lookup: {
  //           from: 'products',
  //           localField: 'items.productId',
  //           foreignField: '_id',
  //           as: 'product'
  //         }
  //       },
  //       { $unwind: '$product' },
  //       {
  //         $group: {
  //           _id: '$product.category',
  //           category: { $first: '$product.category' },
  //           totalRevenue: {
  //             $sum: { $multiply: ['$items.price', '$items.quantity'] }
  //           },
  //           totalCost: {
  //             $sum: {
  //               $multiply: [
  //                 { $ifNull: ['$product.purchasePrice', 0] },
  //                 '$items.quantity'
  //               ]
  //             }
  //           },
  //           totalQuantity: { $sum: '$items.quantity' },
  //           productCount: { $addToSet: '$product._id' }
  //         }
  //       },
  //       {
  //         $project: {
  //           category: 1,
  //           totalRevenue: 1,
  //           totalCost: 1,
  //           totalQuantity: 1,
  //           totalProfit: { $subtract: ['$totalRevenue', '$totalCost'] },
  //           profitMargin: {
  //             $cond: [
  //               { $gt: ['$totalRevenue', 0] },
  //               { $multiply: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCost'] }, '$totalRevenue'] }, 100] },
  //               0
  //             ]
  //           },
  //           uniqueProducts: { $size: '$productCount' },
  //           averageRevenuePerProduct: {
  //             $cond: [
  //               { $gt: [{ $size: '$productCount' }, 0] },
  //               { $divide: ['$totalRevenue', { $size: '$productCount' }] },
  //               0
  //             ]
  //           }
  //         }
  //       },
  //       { $sort: { totalProfit: -1 } }
  //     ];

  //     return await Invoice.aggregate(aggregation);
  //   }

  //   static getEmptySummary() {
  //     return {
  //       totalInvoices: 0,
  //       totalRevenue: 0,
  //       totalCost: 0,
  //       totalTax: 0,
  //       totalDiscount: 0,
  //       totalQuantity: 0,
  //       grossProfit: 0,
  //       netProfit: 0,
  //       profitMargin: 0,
  //       markup: 0,
  //       averageRevenuePerInvoice: 0,
  //       averageProfitPerInvoice: 0,
  //       averageItemsPerInvoice: 0
  //     };
  //   }
  // }

  // module.exports = ProfitCalculator;
