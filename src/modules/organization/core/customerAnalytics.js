const mongoose = require('mongoose');
const { Parser } = require('json2csv'); // You might need to install: npm install json2csv
const Customer = require('./customer.model');
const Invoice = require('../../accounting/billing/invoice.model');
const Payment = require('../../accounting/payments/payment.model');
const EMI = require('../../accounting/payments/emi.model');

class AnalyticsController {

  /**
   * Helper: Get Timezone
   */
  getTimezone(req) {
    return req.query.timezone || 'Asia/Kolkata';
  }

  /**
   * Helper: Fill Monthly Gaps
   * Ensures charts don't look weird if a month has 0 sales.
   */
  fillMonthlyGaps(data, year) {
    const filled = [];
    // Create map of existing data
    const dataMap = new Map();
    data.forEach(item => {
        // Handle cases where _id is an object (from aggregation)
        const month = item._id.month || item._id; 
        dataMap.set(month, item);
    });

    for (let i = 1; i <= 12; i++) {
        if (dataMap.has(i)) {
            filled.push(dataMap.get(i));
        } else {
            // Push empty frame
            filled.push({
                _id: { month: i },
                totalSales: 0,
                invoiceCount: 0,
                avgInvoiceValue: 0,
                totalPayments: 0,
                paymentCount: 0
            });
        }
    }
    return filled;
  }

  // =================================================================
  // 1. DASHBOARD OVERVIEW
  // =================================================================
  async getCustomerOverview(req, res) {
    try {
      const { organizationId } = req.user;
      const { startDate, endDate, branchId } = req.query;
      const timezone = this.getTimezone(req);

      const matchStage = {
        organizationId: new mongoose.Types.ObjectId(organizationId),
        isDeleted: false
      };

      if (branchId) matchStage.branchId = new mongoose.Types.ObjectId(branchId);
      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = new Date(startDate);
        if (endDate) matchStage.createdAt.$lte = new Date(endDate);
      }

      // Single DB Facet Call
      const [overview] = await Customer.aggregate([
        { $match: matchStage },
        {
          $facet: {
            customerStats: [
              { $group: { _id: '$type', count: { $sum: 1 }, totalOutstanding: { $sum: '$outstandingBalance' } } }
            ],
            activeStats: [
              { $group: { _id: '$isActive', count: { $sum: 1 } } }
            ],
            topCustomers: [
              { $match: { outstandingBalance: { $gt: 0 } } },
              { $sort: { outstandingBalance: -1 } },
              { $limit: 10 },
              { $project: { name: 1, type: 1, outstandingBalance: 1, phone: 1, avatar: 1 } }
            ],
            monthlyGrowth: [
              {
                $group: {
                  _id: {
                    year: { $year: { date: '$createdAt', timezone } },
                    month: { $month: { date: '$createdAt', timezone } }
                  },
                  newCustomers: { $sum: 1 }
                }
              },
              { $sort: { '_id.year': 1, '_id.month': 1 } },
              { $limit: 12 }
            ]
          }
        }
      ]);

      const recentCustomers = await Customer.find(matchStage)
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name type phone outstandingBalance createdAt avatar')
        .lean();

      res.json({ success: true, data: { overview, recentCustomers } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =================================================================
  // 2. FINANCIAL ANALYTICS (With Gap Filling)
  // =================================================================
  async getCustomerFinancialAnalytics(req, res) {
    try {
      const { organizationId } = req.user;
      const { customerId, year } = req.query;
      const currentYear = parseInt(year) || new Date().getFullYear();
      const timezone = this.getTimezone(req);

      const startOfYear = new Date(`${currentYear}-01-01`);
      const endOfYear = new Date(`${currentYear}-12-31T23:59:59.999Z`);

      const baseMatch = { organizationId: new mongoose.Types.ObjectId(organizationId), isDeleted: false };
      if (customerId) baseMatch.customerId = new mongoose.Types.ObjectId(customerId);

      // Dynamic Group Keys
      const salesKey = customerId 
        ? { month: { $month: { date: '$invoiceDate', timezone } }, customerId: '$customerId' }
        : { month: { $month: { date: '$invoiceDate', timezone } } };

      const [salesData, paymentData, outstandingData, overdueInvoices] = await Promise.all([
        // Sales
        Invoice.aggregate([
          { $match: { ...baseMatch, status: { $in: ['issued', 'paid'] }, invoiceDate: { $gte: startOfYear, $lte: endOfYear } } },
          { $group: { _id: salesKey, totalSales: { $sum: '$grandTotal' }, invoiceCount: { $sum: 1 }, avgInvoiceValue: { $avg: '$grandTotal' } } },
          { $sort: { '_id.month': 1 } }
        ]),
        // Payments
        Payment.aggregate([
          { $match: { ...baseMatch, type: 'inflow', status: 'completed', paymentDate: { $gte: startOfYear, $lte: endOfYear } } },
          { $group: { _id: { month: { $month: { date: '$paymentDate', timezone } } }, totalPayments: { $sum: '$amount' }, paymentCount: { $sum: 1 } } }
        ]),
        // Outstanding
        Customer.aggregate([
          { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), isDeleted: false, outstandingBalance: { $gt: 0 } } },
          { $bucket: { groupBy: '$outstandingBalance', boundaries: [0, 1000, 5000, 10000, 50000, 100000, Infinity], default: 'Other', output: { count: { $sum: 1 }, totalAmount: { $sum: '$outstandingBalance' } } } }
        ]),
        // Overdue List
        Invoice.find({ ...baseMatch, dueDate: { $lt: new Date() }, paymentStatus: { $in: ['unpaid', 'partial'] } })
          .select('invoiceNumber grandTotal balanceAmount dueDate customerId')
          .populate('customerId', 'name phone')
          .sort({ dueDate: 1 })
          .limit(20)
          .lean()
      ]);

      // Fill Gaps for Charts
      const normalizedSales = this.fillMonthlyGaps(salesData);
      const normalizedPayments = this.fillMonthlyGaps(paymentData);

      res.json({
        success: true,
        data: {
          salesAnalysis: normalizedSales,
          paymentPatterns: normalizedPayments,
          outstandingAging: outstandingData,
          overdueInvoices
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =================================================================
  // 3. PAYMENT BEHAVIOR
  // =================================================================
  async getCustomerPaymentBehavior(req, res) {
    try {
      const { organizationId } = req.user;
      const { customerId, months = 6 } = req.query;
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - parseInt(months));

      const matchStage = { organizationId: new mongoose.Types.ObjectId(organizationId), type: 'inflow', status: 'completed', paymentDate: { $gte: cutoffDate } };
      if (customerId) matchStage.customerId = new mongoose.Types.ObjectId(customerId);

      const behaviorData = await Payment.aggregate([
        { $match: matchStage },
        { 
            $lookup: { 
                from: 'invoices', 
                let: { invId: "$invoiceId" },
                pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$invId"] } } }, { $project: { dueDate: 1 } }],
                as: 'invoice' 
            } 
        },
        { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$customerId',
            totalPaid: { $sum: '$amount' },
            paymentCount: { $sum: 1 },
            avgPaymentDelay: { 
                $avg: { $cond: [ { $and: ['$invoice', '$invoice.dueDate'] }, { $divide: [ { $subtract: ['$paymentDate', '$invoice.dueDate'] }, 86400000 ] }, 0 ] } 
            },
            paymentMethods: { $addToSet: '$paymentMethod' }
          }
        },
        { $sort: { totalPaid: -1 } },
        { $limit: 20 },
        { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
        { $unwind: '$customer' },
        { $project: { customerName: '$customer.name', totalPaid: 1, paymentCount: 1, avgPaymentDelay: { $round: ['$avgPaymentDelay', 1] }, paymentMethods: 1 } }
      ]);

      res.json({ success: true, data: behaviorData });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =================================================================
  // 4. LIFETIME VALUE (Optimized Sort-Before-Lookup)
  // =================================================================
  async getCustomerLifetimeValue(req, res) {
    try {
      const { organizationId } = req.user;
      const { limit = 50 } = req.query;

      const ltvData = await Invoice.aggregate([
        { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), status: { $in: ['issued', 'paid'] }, isDeleted: false } },
        { $group: { _id: '$customerId', totalRevenue: { $sum: '$grandTotal' }, firstPurchase: { $min: '$invoiceDate' }, lastPurchase: { $max: '$invoiceDate' }, invoiceCount: { $sum: 1 }, avgOrderValue: { $avg: '$grandTotal' } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: parseInt(limit) },
        { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
        { $unwind: '$customer' },
        { $lookup: { from: 'payments', let: { cId: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$customerId', '$$cId'] }, { $eq: ['$type', 'inflow'] }] } } }, { $group: { _id: null, paid: { $sum: '$amount' } } }], as: 'pmt' } },
        { $unwind: { path: '$pmt', preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                totalPaid: { $ifNull: ['$pmt.paid', 0] },
                ageDays: { $divide: [{ $subtract: [new Date(), '$customer.createdAt'] }, 86400000] }
            }
        },
        {
          $project: {
            customerName: '$customer.name', type: '$customer.type', avatar: '$customer.avatar',
            totalRevenue: 1, totalPaid: 1, invoiceCount: 1, avgOrderValue: { $round: ['$avgOrderValue', 2] },
            ageDays: { $round: ['$ageDays', 0] },
            firstPurchase: 1, lastPurchase: 1
          }
        }
      ]);

      res.json({ success: true, data: ltvData });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =================================================================
  // 5. SEGMENTATION (Safe Slicing)
  // =================================================================
  async getCustomerSegmentation(req, res) {
    try {
      const { organizationId } = req.user;
      const lookbackDate = new Date();
      lookbackDate.setFullYear(lookbackDate.getFullYear() - 1);

      const segmentData = await Invoice.aggregate([
        { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), status: { $in: ['issued', 'paid'] }, invoiceDate: { $gte: lookbackDate } } },
        { $group: { _id: '$customerId', totalSpent: { $sum: '$grandTotal' }, orderCount: { $sum: 1 }, lastPurchaseDate: { $max: '$invoiceDate' } } },
        { $addFields: { recencyDays: { $divide: [{ $subtract: [new Date(), '$lastPurchaseDate'] }, 86400000] } } },
        {
            $addFields: {
                segment: {
                    $switch: {
                        branches: [
                          { case: { $and: [{ $lte: ['$recencyDays', 30] }, { $gte: ['$orderCount', 5] }, { $gte: ['$totalSpent', 50000] }] }, then: 'Champions' },
                          { case: { $and: [{ $lte: ['$recencyDays', 90] }, { $gte: ['$orderCount', 3] }] }, then: 'Loyal' },
                          { case: { $and: [{ $lte: ['$recencyDays', 30] }, { $lt: ['$orderCount', 3] }] }, then: 'Recent' },
                          { case: { $and: [{ $gt: ['$recencyDays', 90] }, { $lt: ['$recencyDays', 180] }] }, then: 'At Risk' },
                          { case: { $gt: ['$recencyDays', 180] }, then: 'Lost' }
                        ],
                        default: 'Need Attention'
                    }
                }
            }
        },
        { $group: { _id: '$segment', count: { $sum: 1 }, totalRevenue: { $sum: '$totalSpent' }, sampleCustomers: { $push: '$_id' } } },
        { $project: { segment: '$_id', count: 1, totalRevenue: 1, sampleCustomerIds: { $slice: ['$sampleCustomers', 5] } } },
        { $sort: { totalRevenue: -1 } }
      ]);

      res.json({ success: true, data: segmentData });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =================================================================
  // 6. EMI ANALYTICS
  // =================================================================
  async getCustomerEMIAnalytics(req, res) {
    try {
      const { organizationId } = req.user;
      const emiData = await EMI.aggregate([
        { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), status: 'active' } },
        { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'c' } }, { $unwind: '$c' },
        { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'inv' } }, { $unwind: '$inv' },
        {
          $project: {
            customerName: '$c.name', invoiceNumber: '$inv.invoiceNumber',
            totalAmount: 1, balanceAmount: 1,
            nextDueDate: { $min: { $filter: { input: '$installments.dueDate', as: 'd', cond: { $gt: ['$$d', new Date()] } } } }
          }
        },
        { $sort: { balanceAmount: -1 } }
      ]);
      res.json({ success: true, data: emiData });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =================================================================
  // 7. REAL-TIME DASHBOARD (Parallel Counts)
  // =================================================================
  async getRealTimeDashboard(req, res) {
    try {
      const { organizationId } = req.user;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const q = { organizationId, isDeleted: false };

      const [total, active, sales, outstanding, recent] = await Promise.all([
        Customer.countDocuments(q),
        Customer.countDocuments({ ...q, isActive: true }),
        Invoice.aggregate([{ $match: { organizationId: new mongoose.Types.ObjectId(organizationId), invoiceDate: { $gte: today }, status: { $in: ['issued', 'paid'] } } }, { $group: { _id: null, amt: { $sum: '$grandTotal' } } }]),
        Customer.aggregate([{ $match: { ...q, outstandingBalance: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$outstandingBalance' } } }]),
        Payment.find({ organizationId, type: 'inflow' }).sort({ paymentDate: -1 }).limit(5).populate('customerId', 'name').select('amount paymentMethod customerId')
      ]);

      res.json({
        success: true,
        data: {
          stats: { total, active },
          todaySales: sales[0]?.amt || 0,
          totalOutstanding: outstanding[0]?.total || 0,
          recentActivity: recent
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =================================================================
  // 8. GEOSPATIAL
  // =================================================================
  async getCustomerGeospatial(req, res) {
    try {
      const { organizationId } = req.user;
      const geoData = await Customer.aggregate([
        { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), isDeleted: false, 'billingAddress.city': { $exists: true, $ne: '' } } },
        { $group: { _id: { city: { $toLower: { $trim: { input: '$billingAddress.city' } } }, state: { $toLower: { $trim: { input: '$billingAddress.state' } } } }, count: { $sum: 1 }, outstanding: { $sum: '$outstandingBalance' } } },
        { $project: { city: '$_id.city', state: '$_id.state', count: 1, outstanding: 1, location: { $concat: ['$_id.city', ', ', '$_id.state'] } } },
        { $sort: { count: -1 } }
      ]);
      res.json({ success: true, data: geoData });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =================================================================
  // 9. EXPORT TO CSV (Streaming)
  // =================================================================
  async exportFinancialsToCSV(req, res) {
    try {
        const { organizationId } = req.user;
        const { year } = req.query;
        
        // Define fields
        const fields = ['Date', 'InvoiceNumber', 'CustomerName', 'Amount', 'Balance', 'Status'];
        const json2csv = new Parser({ fields });

        // Stream Query
        const cursor = Invoice.find({ 
            organizationId: new mongoose.Types.ObjectId(organizationId), 
            status: { $in: ['issued', 'paid'] },
            ...(year && { invoiceDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } })
        })
        .populate('customerId', 'name') // Lean populate
        .cursor();

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=financials.csv');

        // Simple transformer
        let isFirst = true;
        cursor.on('data', (doc) => {
            const rowData = {
                Date: doc.invoiceDate ? doc.invoiceDate.toISOString().split('T')[0] : '',
                InvoiceNumber: doc.invoiceNumber,
                CustomerName: doc.customerId?.name || 'Unknown',
                Amount: doc.grandTotal,
                Balance: doc.balanceAmount,
                Status: doc.paymentStatus
            };
            const csv = json2csv.parse(rowData);
            // If first row, keep headers. If not, strip headers.
            const row = isFirst ? csv : csv.split('\n').slice(1).join('\n');
            res.write(row + '\n');
            isFirst = false;
        });

        cursor.on('end', () => res.end());
        cursor.on('error', (err) => {
            console.error('CSV Stream Error', err);
            res.end();
        });

    } catch (error) {
        console.error('CSV Error:', error);
        res.status(500).send('Error exporting CSV');
    }
  }
}

module.exports = new AnalyticsController();
