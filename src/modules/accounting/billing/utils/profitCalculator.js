// utils/profitCalculator.js
const Product = require("../../../inventory/core/product.model");
const Invoice = require("../invoice.model");

class ProfitCalculator {
  /**
   * Calculate profit for a single invoice
   */
  static async calculateInvoiceProfit(invoice) {
    if (!invoice || !invoice.items || invoice.items.length === 0) {
      return {
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        items: []
      };
    }

    let totalRevenue = invoice.grandTotal || 0;
    let totalCost = 0;
    const itemProfits = [];

    // Calculate profit for each item
    for (const item of invoice.items) {
      let itemCost = 0;
      let itemRevenue = 0;
      
      if (item.productId) {
        // If product is populated
        const product = item.productId;
        itemCost = (product.purchasePrice || 0) * item.quantity;
        itemRevenue = item.price * item.quantity;
      } else {
        // If product is not populated, fetch it
        const product = await Product.findById(item.productId).lean();
        if (product) {
          itemCost = (product.purchasePrice || 0) * item.quantity;
          itemRevenue = item.price * item.quantity;
        } else {
          itemCost = 0;
          itemRevenue = item.price * item.quantity;
        }
      }

      const itemProfit = itemRevenue - itemCost;
      const itemMargin = itemRevenue > 0 ? (itemProfit / itemRevenue) * 100 : 0;

      itemProfits.push({
        productId: item.productId._id || item.productId,
        productName: item.name,
        quantity: item.quantity,
        sellingPrice: item.price,
        costPrice: itemCost / item.quantity,
        revenue: itemRevenue,
        cost: itemCost,
        profit: itemProfit,
        profitMargin: itemMargin
      });

      totalCost += itemCost;
    }

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      revenue: totalRevenue,
      cost: totalCost,
      profit: totalProfit,
      margin: profitMargin,
      items: itemProfits
    };
  }

  /**
   * Calculate profit for multiple invoices
   */
  static async calculateBulkProfit(invoices) {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    const productWiseProfits = {};

    for (const invoice of invoices) {
      const profitData = await this.calculateInvoiceProfit(invoice);
      
      totalRevenue += profitData.revenue;
      totalCost += profitData.cost;
      totalProfit += profitData.profit;

      // Aggregate by product
      for (const itemProfit of profitData.items) {
        const productId = itemProfit.productId.toString();
        
        if (!productWiseProfits[productId]) {
          productWiseProfits[productId] = {
            productId,
            productName: itemProfit.productName,
            totalQuantity: 0,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0
          };
        }

        productWiseProfits[productId].totalQuantity += itemProfit.quantity;
        productWiseProfits[productId].totalRevenue += itemProfit.revenue;
        productWiseProfits[productId].totalCost += itemProfit.cost;
        productWiseProfits[productId].totalProfit += itemProfit.profit;
      }
    }

    // Calculate margins for each product
    const productProfitArray = Object.values(productWiseProfits).map(product => ({
      ...product,
      averagePrice: product.totalRevenue / product.totalQuantity,
      averageCost: product.totalCost / product.totalQuantity,
      profitMargin: product.totalRevenue > 0 ? (product.totalProfit / product.totalRevenue) * 100 : 0,
      profitPerUnit: product.totalProfit / product.totalQuantity
    }));

    return {
      summary: {
        totalRevenue,
        totalCost,
        totalProfit,
        profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        totalInvoices: invoices.length,
        averageRevenuePerInvoice: invoices.length > 0 ? totalRevenue / invoices.length : 0,
        averageProfitPerInvoice: invoices.length > 0 ? totalProfit / invoices.length : 0
      },
      productAnalysis: productProfitArray.sort((a, b) => b.totalProfit - a.totalProfit)
    };
  }

  /**
   * Get profit by time period
   */
  static async getProfitByPeriod(orgId, startDate, endDate, groupBy = 'day') {
    const match = {
      organizationId: orgId,
      status: { $in: ['issued', 'paid'] },
      isDeleted: { $ne: true }
    };

    if (startDate || endDate) {
      match.invoiceDate = {};
      if (startDate) match.invoiceDate.$gte = new Date(startDate);
      if (endDate) match.invoiceDate.$lte = new Date(endDate);
    }

    // Fetch invoices with product details
    const invoices = await Invoice.find(match)
      .populate({
        path: 'items.productId',
        select: 'name purchasePrice'
      })
      .lean();

    const groupedData = {};
    
    for (const invoice of invoices) {
      const invoiceDate = new Date(invoice.invoiceDate);
      let groupKey;
      
      switch (groupBy) {
        case 'day':
          groupKey = invoiceDate.toISOString().split('T')[0]; // YYYY-MM-DD
          break;
        case 'week':
          const weekStart = new Date(invoiceDate);
          weekStart.setDate(invoiceDate.getDate() - invoiceDate.getDay());
          groupKey = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          groupKey = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'year':
          groupKey = invoiceDate.getFullYear().toString();
          break;
        default:
          groupKey = invoiceDate.toISOString().split('T')[0];
      }

      if (!groupedData[groupKey]) {
        groupedData[groupKey] = {
          period: groupKey,
          revenue: 0,
          cost: 0,
          profit: 0,
          invoiceCount: 0
        };
      }

      // Calculate profit for this invoice
      let invoiceCost = 0;
      for (const item of invoice.items) {
        if (item.productId) {
          const purchasePrice = item.productId.purchasePrice || 0;
          invoiceCost += purchasePrice * item.quantity;
        }
      }

      groupedData[groupKey].revenue += invoice.grandTotal;
      groupedData[groupKey].cost += invoiceCost;
      groupedData[groupKey].profit += (invoice.grandTotal - invoiceCost);
      groupedData[groupKey].invoiceCount += 1;
    }

    // Convert to array and sort
    const result = Object.values(groupedData).map(item => ({
      ...item,
      profitMargin: item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0,
      averageProfitPerInvoice: item.invoiceCount > 0 ? item.profit / item.invoiceCount : 0
    })).sort((a, b) => a.period.localeCompare(b.period));

    return result;
  }
}

module.exports = ProfitCalculator;