const Supplier = require('./supplier.model');
const Purchase = require('../../inventory/core/purchase.model');
const Payment = require('../../accounting/payments/payment.model');
const factory = require('../../../core/utils/handlerFactory');
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const mongoose = require('mongoose');
const imageUploadService = require("../../_legacy/services/uploads/imageUploadService");

// Standard CRUD
exports.createSupplier = factory.createOne(Supplier);
exports.createbulkSupplier = factory.bulkCreate(Supplier);
exports.getAllSuppliers = factory.getAll(Supplier);
exports.getSupplier = factory.getOne(Supplier);
exports.updateSupplier = factory.updateOne(Supplier);
exports.deleteSupplier = factory.deleteOne(Supplier);
exports.restoreSupplier = factory.restoreOne(Supplier);

// Dropdown list
exports.getSupplierList = catchAsync(async (req, res, next) => {
  const suppliers = await Supplier.find({
    organizationId: req.user.organizationId,
    isDeleted: { $ne: true },
  }).select('companyName phone gstNumber');

  res.status(200).json({
    status: 'success',
    results: suppliers.length,
    data: { suppliers },
  });
});

// Search
exports.searchSuppliers = catchAsync(async (req, res, next) => {
  const q = req.query.q || "";
  const org = req.user.organizationId;

  const suppliers = await Supplier.find({
    organizationId: org,
    isDeleted: false,
    $or: [
      { companyName: { $regex: q, $options: "i" } },
      { contactPerson: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
      { altPhone: { $regex: q, $options: "i" } },
      { gstNumber: { $regex: q, $options: "i" } },
      { panNumber: { $regex: q, $options: "i" } },
    ]
  }).limit(50);

  res.status(200).json({
    status: "success",
    results: suppliers.length,
    data: { suppliers },
  });
});

/* ===================================================
   🔥 NEW: Supplier Financial Dashboard
==================================================== */
exports.getSupplierDashboard = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const organizationId = req.user.organizationId;
  const supplierObjectId = new mongoose.Types.ObjectId(id);

  // 1. Validate Supplier Existence
  const supplier = await Supplier.findOne({ 
    _id: supplierObjectId, 
    organizationId,
    isDeleted: false 
  });

  if (!supplier) {
    return next(new AppError('No supplier found with that ID', 404));
  }

  // 2. Parallel Data Fetching for Performance
  const [purchaseStats, paymentStats, recentPurchases, recentPayments] = await Promise.all([
    
    // A. Purchase Stats (Total Billed, Total Pending Bills)
    Purchase.aggregate([
      { $match: { 
          organizationId: new mongoose.Types.ObjectId(organizationId), 
          supplierId: supplierObjectId,
          isDeleted: false,
          status: { $ne: 'cancelled' }
      }},
      { $group: {
          _id: null,
          totalPurchased: { $sum: "$grandTotal" },
          totalBalancePending: { $sum: "$balanceAmount" },
          count: { $sum: 1 },
          avgTicketSize: { $avg: "$grandTotal" }
      }}
    ]),

    // B. Payment Stats (Total Paid Out)
    Payment.aggregate([
      { $match: { 
          organizationId: new mongoose.Types.ObjectId(organizationId), 
          supplierId: supplierObjectId,
          type: 'outflow', // Only money going OUT to supplier
          status: 'completed',
          isDeleted: false
      }},
      { $group: {
          _id: null,
          totalPaid: { $sum: "$amount" },
          count: { $sum: 1 }
      }}
    ]),

    // C. Recent 5 Purchases (The "Bills")
    Purchase.find({ 
      organizationId, 
      supplierId: supplierObjectId,
      isDeleted: false 
    })
    .select('invoiceNumber purchaseDate grandTotal paymentStatus balanceAmount dueDate')
    .sort({ purchaseDate: -1 })
    .limit(5),

    // D. Recent 5 Payments
    Payment.find({ 
      organizationId, 
      supplierId: supplierObjectId, 
      type: 'outflow',
      isDeleted: false
    })
    .select('referenceNumber paymentDate amount paymentMethod status')
    .sort({ paymentDate: -1 })
    .limit(5)
  ]);

  // 3. Data Parsing (Aggregations return arrays, so pick the first item)
  const pStats = purchaseStats[0] || { totalPurchased: 0, totalBalancePending: 0, count: 0 };
  const payStats = paymentStats[0] || { totalPaid: 0, count: 0 };

  // 4. Construct the Final Response
  const dashboardData = {
    profile: {
      _id: supplier._id,
      companyName: supplier.companyName,
      contactPerson: supplier.contactPerson,
      email: supplier.email,
      phone: supplier.phone,
      gstNumber: supplier.gstNumber,
      avatar: supplier.avatar
    },
    financials: {
      totalVolume: pStats.totalPurchased,       // Total Lifetime Purchase Value
      totalPaid: payStats.totalPaid,            // Total Lifetime Paid
      outstanding: pStats.totalBalancePending,  // Calculated dynamically from Purchases
      walletBalance: supplier.openingBalance,   // If you use this for specific ledger adjustments
      totalInvoices: pStats.count
    },
    tables: {
      recentPurchases, // Array of last 5 bills
      recentPayments   // Array of last 5 transactions
    }
  };

  res.status(200).json({
    status: 'success',
    data: dashboardData
  });
});

exports.downloadSupplierLedger = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    const organizationId = req.user.organizationId;

    // 1. Define Date Range (Default to "All Time" if not provided)
    const queryFilter = {
        organizationId: new mongoose.Types.ObjectId(organizationId),
        supplierId: new mongoose.Types.ObjectId(id),
        isDeleted: false
    };

    const dateFilter = {};
    if (startDate && endDate) {
        dateFilter.$gte = new Date(startDate);
        dateFilter.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
    }

    // 2. Fetch Data in Parallel
    const [supplier, purchases, payments] = await Promise.all([
        Supplier.findOne({ _id: id, organizationId }),
        Purchase.find({
            ...queryFilter,
            ...(startDate ? { purchaseDate: dateFilter } : {})
        }).sort({ purchaseDate: 1 }),
        Payment.find({
            ...queryFilter,
            type: 'outflow',
            status: 'completed',
            ...(startDate ? { paymentDate: dateFilter } : {})
        }).sort({ paymentDate: 1 })
    ]);

    if (!supplier) return next(new AppError('Supplier not found', 404));

    // 3. Create Workbook & Sheets
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Your App Name';
    workbook.created = new Date();

    // --- SHEET 1: SUMMARY ---
    const summarySheet = workbook.addWorksheet('Summary');
    
    // Styling helper
    const headerStyle = { font: { bold: true, size: 12 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } } };

    summarySheet.columns = [{ width: 25 }, { width: 35 }];
    summarySheet.addRow(['SUPPLIER LEDGER REPORT']).font = { bold: true, size: 16 };
    summarySheet.addRow([`Generated on: ${new Date().toLocaleDateString()}`]);
    summarySheet.addRow([]); // Empty row
    
    // Supplier Details
    summarySheet.addRow(['Company Name', supplier.companyName]);
    summarySheet.addRow(['Contact Person', supplier.contactPerson || 'N/A']);
    summarySheet.addRow(['Phone', supplier.phone || 'N/A']);
    summarySheet.addRow(['GST Number', supplier.gstNumber || 'N/A']);
    summarySheet.addRow([]);

    // Financial Totals for this period
    const totalBilled = purchases.reduce((sum, p) => sum + p.grandTotal, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    summarySheet.addRow(['Total Billed (Period)', totalBilled]);
    summarySheet.addRow(['Total Paid (Period)', totalPaid]);
    summarySheet.addRow(['Net Balance (Period)', totalBilled - totalPaid]);
    
    // Style the summary rows
    summarySheet.eachRow((row, rowNumber) => {
        if(rowNumber > 3 && rowNumber < 9) row.getCell(1).font = { bold: true };
    });

    // --- SHEET 2: BILLS (Purchases) ---
    const billSheet = workbook.addWorksheet('Bills & Invoices');
    billSheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Invoice No', key: 'invoice', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Due Date', key: 'due', width: 15 },
        { header: 'Total Amount', key: 'total', width: 15 },
        { header: 'Balance Due', key: 'balance', width: 15 },
    ];

    // Apply Header Style
    billSheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });

    purchases.forEach(p => {
        billSheet.addRow({
            date: p.purchaseDate ? new Date(p.purchaseDate).toLocaleDateString() : '-',
            invoice: p.invoiceNumber,
            status: p.paymentStatus.toUpperCase(),
            due: p.dueDate ? new Date(p.dueDate).toLocaleDateString() : '-',
            total: p.grandTotal,
            balance: p.balanceAmount
        });
    });

    // --- SHEET 3: PAYMENTS ---
    const paySheet = workbook.addWorksheet('Payment History');
    paySheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Reference No', key: 'ref', width: 20 },
        { header: 'Method', key: 'method', width: 15 },
        { header: 'Remarks', key: 'remarks', width: 30 },
        { header: 'Amount Paid', key: 'amount', width: 15 },
    ];

    paySheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });

    payments.forEach(pay => {
        paySheet.addRow({
            date: pay.paymentDate ? new Date(pay.paymentDate).toLocaleDateString() : '-',
            ref: pay.referenceNumber || '-',
            method: pay.paymentMethod.toUpperCase(),
            remarks: pay.remarks || '-',
            amount: pay.amount
        });
    });

    // 4. Send Response
    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
        'Content-Disposition',
        `attachment; filename=Supplier_Ledger_${supplier.companyName.replace(/ /g,'_')}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
});