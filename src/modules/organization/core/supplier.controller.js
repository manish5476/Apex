const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const cloudinary = require('cloudinary').v2;

// Models
const Supplier = require('./supplier.model');
const Purchase = require('../../inventory/core/purchase.model'); 
const Payment = require('../../accounting/payments/payment.model');
const PurchaseReturn = require('../../inventory/core/purchase.return.model'); // 🟢 Added for Defect Rate

// Utils & Services
const factory = require('../../../core/utils/api/handlerFactory');
const catchAsync = require("../../../core/utils/api/catchAsync");
const AppError = require("../../../core/utils/api/appError");
const fileUploadService = require('../../uploads/fileUploadService');

// Helper: Escape Regex Special Characters to prevent crashes
const escapeRegex = (text) => {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

/* ===================================================
   Standard CRUD (Factory)
==================================================== */
exports.createSupplier = factory.createOne(Supplier);
exports.createbulkSupplier = factory.bulkCreate(Supplier);
exports.getAllSuppliers = factory.getAll(Supplier);
exports.getSupplier = factory.getOne(Supplier);
exports.updateSupplier = factory.updateOne(Supplier);
exports.deleteSupplier = factory.deleteOne(Supplier);
exports.restoreSupplier = factory.restoreOne(Supplier);

/* ===================================================
   Dropdown List (Safe Version)
==================================================== */
exports.getSupplierList = catchAsync(async (req, res, next) => {
  const suppliers = await Supplier.find({
    organizationId: req.user.organizationId,
    isActive: true, // Ensure only active suppliers show in dropdowns
    isDeleted: false,
  })
  .select('companyName phone gstNumber')
  .limit(500); // 🟢 Limit added to prevent browser crash on huge databases

  res.status(200).json({
    status: 'success',
    results: suppliers.length,
    data: { suppliers },
  });
});

/* ===================================================
   Search API
==================================================== */
exports.searchSuppliers = catchAsync(async (req, res, next) => {
  const q = req.query.q;
  if (!q) {
      return res.status(200).json({ status: "success", results: 0, data: { suppliers: [] } });
  }

  const org = req.user.organizationId;
  const regex = new RegExp(escapeRegex(q), 'i');

  const suppliers = await Supplier.find({
    organizationId: org,
    isDeleted: false,
    $or: [
      { companyName: regex },
      { contactPerson: regex },
      { phone: regex },
      { altPhone: regex },
      { gstNumber: regex },
      { panNumber: regex },
    ]
  }).limit(50);

  res.status(200).json({
    status: "success",
    results: suppliers.length,
    data: { suppliers },
  });
});

/* ===================================================
   🔥 Supplier Financial Dashboard
==================================================== */
exports.getSupplierDashboard = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const organizationId = req.user.organizationId;
  
  if (!mongoose.Types.ObjectId.isValid(id)) return next(new AppError('Invalid ID format', 400));
  const supplierObjectId = new mongoose.Types.ObjectId(id);

  // 1. Validate Supplier
  const supplier = await Supplier.findOne({ 
    _id: supplierObjectId, 
    organizationId,
    isDeleted: false 
  });

  if (!supplier) {
    return next(new AppError('No supplier found with that ID', 404));
  }

  // 2. Parallel Data Fetching
  const [purchaseStats, paymentStats, returnStats, recentPurchases, recentPayments] = await Promise.all([
    
    // A. Purchase Stats
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
          count: { $sum: 1 }
      }}
    ]),

    // B. Payment Stats
    Payment.aggregate([
      { $match: { 
          organizationId: new mongoose.Types.ObjectId(organizationId), 
          supplierId: supplierObjectId,
          type: 'outflow',
          status: 'completed',
          isDeleted: false
      }},
      { $group: {
          _id: null,
          totalPaid: { $sum: "$amount" },
          count: { $sum: 1 }
      }}
    ]),

    // C. Return/Defect Stats (🟢 NEW)
    PurchaseReturn.aggregate([
      { $match: { 
          organizationId: new mongoose.Types.ObjectId(organizationId), 
          supplierId: supplierObjectId 
      }},
      { $group: {
          _id: null,
          totalReturnedAmount: { $sum: "$totalAmount" },
          returnCount: { $sum: 1 }
      }}
    ]),

    // D. Recent Bills
    Purchase.find({ 
      organizationId, 
      supplierId: supplierObjectId,
      isDeleted: false 
    })
    .select('invoiceNumber purchaseDate grandTotal paymentStatus balanceAmount dueDate')
    .sort({ purchaseDate: -1 })
    .limit(5),

    // E. Recent Payments
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

  // Extract Stats Safely
  const pStats = purchaseStats[0] || { totalPurchased: 0, totalBalancePending: 0, count: 0 };
  const payStats = paymentStats[0] || { totalPaid: 0, count: 0 };
  const retStats = returnStats[0] || { totalReturnedAmount: 0, returnCount: 0 };

  // Calculate Ledger Balance & Defect Rate
  const currentLedgerBalance = (supplier.openingBalance || 0) + pStats.totalPurchased - payStats.totalPaid - retStats.totalReturnedAmount;
  
  const defectRate = pStats.totalPurchased > 0 
    ? ((retStats.totalReturnedAmount / pStats.totalPurchased) * 100).toFixed(2) 
    : 0;

  // 🟢 Fixed Data Structure Output
  const dashboardData = {
    profile: {
      _id: supplier._id,
      companyName: supplier.companyName,
      contactPerson: supplier.contactPerson, // Fallback
      contacts: supplier.contacts, // New Array
      email: supplier.email,
      phone: supplier.phone,
      gstNumber: supplier.gstNumber,
      creditLimit: supplier.creditLimit,
      avatar: supplier.avatar
    },
    financials: {
      totalVolume: pStats.totalPurchased,
      totalPaid: payStats.totalPaid,
      outstanding: pStats.totalBalancePending, 
      walletBalance: currentLedgerBalance,
      totalInvoices: pStats.count
    },
    performance: {
      totalReturnedValue: retStats.totalReturnedAmount,
      returnCount: retStats.returnCount,
      defectRatePercent: Number(defectRate)
    },
    // Placed tables at root level for cleaner UI parsing
    recentPurchases,
    recentPayments
  };

  res.status(200).json({
    status: 'success',
    data: dashboardData
  });
});

/* ===================================================
   Excel Ledger Download
==================================================== */
exports.downloadSupplierLedger = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    const organizationId = req.user.organizationId;

    const queryFilter = {
        organizationId: new mongoose.Types.ObjectId(organizationId),
        supplierId: new mongoose.Types.ObjectId(id),
        isDeleted: false
    };

    // 🟢 Fixed Date Filter Logic
    const dateFilter = {};
    if (startDate) {
        dateFilter.$gte = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date(); // Default to today if no endDate
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
    }

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

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ERP System';
    workbook.created = new Date();

    const headerStyle = { font: { bold: true, size: 12 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } } };

    // --- SHEET 1: SUMMARY ---
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [{ width: 25 }, { width: 35 }];
    summarySheet.addRow(['SUPPLIER LEDGER REPORT']).font = { bold: true, size: 16 };
    summarySheet.addRow([`Date Range:`, startDate ? `${startDate} to ${endDate || 'Present'}` : 'All Time']);
    summarySheet.addRow([]); 

    summarySheet.addRow(['Company Name', supplier.companyName]);
    summarySheet.addRow(['GST Number', supplier.gstNumber || '-']);
    summarySheet.addRow([]);

    const totalBilled = purchases.reduce((sum, p) => sum + p.grandTotal, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    summarySheet.addRow(['Total Billed', totalBilled]);
    summarySheet.addRow(['Total Paid', totalPaid]);
    summarySheet.addRow(['Net Movement', totalBilled - totalPaid]);

    // --- SHEET 2: BILLS ---
    const billSheet = workbook.addWorksheet('Bills');
    billSheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Invoice No', key: 'invoice', width: 20 },
        { header: 'Total', key: 'total', width: 15 },
        { header: 'Balance', key: 'balance', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
    ];
    billSheet.getRow(1).eachCell(c => c.style = headerStyle);

    purchases.forEach(p => {
        billSheet.addRow({
            date: p.purchaseDate ? new Date(p.purchaseDate).toLocaleDateString('en-IN') : '-', // 🟢 Fixed Date Format
            invoice: p.invoiceNumber,
            total: p.grandTotal,
            balance: p.balanceAmount,
            status: p.paymentStatus.toUpperCase()
        });
    });

    // --- SHEET 3: PAYMENTS ---
    const paySheet = workbook.addWorksheet('Payments');
    paySheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Ref No', key: 'ref', width: 20 },
        { header: 'Method', key: 'method', width: 15 },
        { header: 'Amount', key: 'amount', width: 15 },
    ];
    paySheet.getRow(1).eachCell(c => c.style = headerStyle);

    payments.forEach(pay => {
        paySheet.addRow({
            date: pay.paymentDate ? new Date(pay.paymentDate).toLocaleDateString('en-IN') : '-', // 🟢 Fixed Date Format
            ref: pay.referenceNumber || '-',
            method: pay.paymentMethod.toUpperCase(),
            amount: pay.amount
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Supplier_${supplier.companyName.replace(/\s+/g,'_')}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
});

/* ===================================================
   ✅ KYC DOCUMENT MANAGEMENT
==================================================== */
exports.uploadKycDocument = catchAsync(async (req, res, next) => {
  const { docType } = req.body;
  if (!req.file || !docType) {
    return next(new AppError("File and docType are required", 400));
  }

  const supplier = await Supplier.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!supplier) return next(new AppError("Supplier not found", 404));

  // Upload to Cloudinary
  const uploadResult = await fileUploadService.uploadFile(req.file.buffer, "suppliers/kyc");

  // Push to documents array
  supplier.documents.push({
    docType,
    url: uploadResult.url,
    public_id: uploadResult.public_id,
    verified: false // Admin can verify later
  });

  await supplier.save();

  res.status(200).json({ status: "success", message: "Document uploaded", data: { supplier } });
});

exports.deleteKycDocument = catchAsync(async (req, res, next) => {
  const supplier = await Supplier.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!supplier) return next(new AppError("Supplier not found", 404));

  const docIndex = req.params.docIndex;
  const doc = supplier.documents[docIndex];
  
  if (!doc) return next(new AppError("Document not found", 404));

  // Delete from Cloudinary
  if (doc.public_id) {
    try { await cloudinary.uploader.destroy(doc.public_id); } 
    catch (err) { console.warn("Cloudinary delete failed", err); }
  }

  supplier.documents.splice(docIndex, 1);
  await supplier.save();

  res.status(200).json({ status: "success", message: "Document deleted" });
});

// const mongoose = require('mongoose');
// const ExcelJS = require('exceljs'); // 🟢 ADDED MISSING IMPORT
// const Supplier = require('./supplier.model');
// // Corrected paths based on your previous messages
// const Purchase = require('../../inventory/core/purchase.model'); 
// const Payment = require('../../accounting/payments/payment.model');
// const factory = require('../../../core/utils/api/handlerFactory');
// const catchAsync = require("../../../core/utils/api/catchAsync");
// const AppError = require("../../../core/utils/api/appError");

// // Helper: Escape Regex Special Characters to prevent crashes
// const escapeRegex = (text) => {
//   return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
// };

// // Standard CRUD
// exports.createSupplier = factory.createOne(Supplier);
// exports.createbulkSupplier = factory.bulkCreate(Supplier);
// exports.getAllSuppliers = factory.getAll(Supplier);
// exports.getSupplier = factory.getOne(Supplier);
// exports.updateSupplier = factory.updateOne(Supplier);
// exports.deleteSupplier = factory.deleteOne(Supplier);
// exports.restoreSupplier = factory.restoreOne(Supplier);

// // Dropdown list
// exports.getSupplierList = catchAsync(async (req, res, next) => {
//   const suppliers = await Supplier.find({
//     organizationId: req.user.organizationId,
//     isDeleted: false, // Standardized to boolean false
//   }).select('companyName phone gstNumber');

//   res.status(200).json({
//     status: 'success',
//     results: suppliers.length,
//     data: { suppliers },
//   });
// });

// // Search (Safe Version)
// exports.searchSuppliers = catchAsync(async (req, res, next) => {
//   const q = req.query.q;
//   if (!q) {
//       return res.status(200).json({ status: "success", results: 0, data: { suppliers: [] } });
//   }

//   const org = req.user.organizationId;
//   const regex = new RegExp(escapeRegex(q), 'i'); // 🟢 Safe Regex

//   const suppliers = await Supplier.find({
//     organizationId: org,
//     isDeleted: false,
//     $or: [
//       { companyName: regex },
//       { contactPerson: regex },
//       { phone: regex },
//       { altPhone: regex },
//       { gstNumber: regex },
//       { panNumber: regex },
//     ]
//   }).limit(50); // Good limit

//   res.status(200).json({
//     status: "success",
//     results: suppliers.length,
//     data: { suppliers },
//   });
// });

// /* ===================================================
//    🔥 NEW: Supplier Financial Dashboard
// ==================================================== */
// exports.getSupplierDashboard = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const organizationId = req.user.organizationId;
  
//   // Use explicit ID check to avoid casting errors if ID is invalid
//   if (!mongoose.Types.ObjectId.isValid(id)) return next(new AppError('Invalid ID format', 400));
//   const supplierObjectId = new mongoose.Types.ObjectId(id);

//   // 1. Validate Supplier
//   const supplier = await Supplier.findOne({ 
//     _id: supplierObjectId, 
//     organizationId,
//     isDeleted: false 
//   });

//   if (!supplier) {
//     return next(new AppError('No supplier found with that ID', 404));
//   }

//   // 2. Parallel Data Fetching
//   const [purchaseStats, paymentStats, recentPurchases, recentPayments] = await Promise.all([
    
//     // A. Purchase Stats
//     Purchase.aggregate([
//       { $match: { 
//           organizationId: new mongoose.Types.ObjectId(organizationId), 
//           supplierId: supplierObjectId,
//           isDeleted: false,
//           status: { $ne: 'cancelled' }
//       }},
//       { $group: {
//           _id: null,
//           totalPurchased: { $sum: "$grandTotal" },
//           totalBalancePending: { $sum: "$balanceAmount" },
//           count: { $sum: 1 },
//           avgTicketSize: { $avg: "$grandTotal" }
//       }}
//     ]),

//     // B. Payment Stats
//     Payment.aggregate([
//       { $match: { 
//           organizationId: new mongoose.Types.ObjectId(organizationId), 
//           supplierId: supplierObjectId,
//           type: 'outflow',
//           status: 'completed',
//           isDeleted: false
//       }},
//       { $group: {
//           _id: null,
//           totalPaid: { $sum: "$amount" },
//           count: { $sum: 1 }
//       }}
//     ]),

//     // C. Recent Bills
//     Purchase.find({ 
//       organizationId, 
//       supplierId: supplierObjectId,
//       isDeleted: false 
//     })
//     .select('invoiceNumber purchaseDate grandTotal paymentStatus balanceAmount dueDate')
//     .sort({ purchaseDate: -1 })
//     .limit(5),

//     // D. Recent Payments
//     Payment.find({ 
//       organizationId, 
//       supplierId: supplierObjectId, 
//       type: 'outflow',
//       isDeleted: false
//     })
//     .select('referenceNumber paymentDate amount paymentMethod status')
//     .sort({ paymentDate: -1 })
//     .limit(5)
//   ]);

//   const pStats = purchaseStats[0] || { totalPurchased: 0, totalBalancePending: 0, count: 0 };
//   const payStats = paymentStats[0] || { totalPaid: 0, count: 0 };

//   // Calculate Net Ledger Balance (Opening + Purchases - Paid)
//   // Assuming openingBalance is what we owed them at start
//   const currentLedgerBalance = (supplier.openingBalance || 0) + pStats.totalPurchased - payStats.totalPaid;

//   const dashboardData = {
//     profile: {
//       _id: supplier._id,
//       companyName: supplier.companyName,
//       contactPerson: supplier.contactPerson,
//       email: supplier.email,
//       phone: supplier.phone,
//       gstNumber: supplier.gstNumber,
//       avatar: supplier.avatar
//     },
//     financials: {
//       totalVolume: pStats.totalPurchased,
//       totalPaid: payStats.totalPaid,
//       outstanding: pStats.totalBalancePending, 
//       walletBalance: currentLedgerBalance, // 🟢 More accurate calculation
//       totalInvoices: pStats.count
//     },
//     tables: {
//       recentPurchases,
//       recentPayments
//     }
//   };

//   res.status(200).json({
//     status: 'success',
//     data: dashboardData
//   });
// });

// /* ===================================================
//    Excel Ledger Download
// ==================================================== */
// exports.downloadSupplierLedger = catchAsync(async (req, res, next) => {
//     const { id } = req.params;
//     const { startDate, endDate } = req.query;
//     const organizationId = req.user.organizationId;

//     const queryFilter = {
//         organizationId: new mongoose.Types.ObjectId(organizationId),
//         supplierId: new mongoose.Types.ObjectId(id),
//         isDeleted: false
//     };

//     const dateFilter = {};
//     if (startDate && endDate) {
//         // Ensure end date covers the full day
//         const end = new Date(endDate);
//         end.setHours(23, 59, 59, 999);

//         dateFilter.$gte = new Date(startDate);
//         dateFilter.$lte = end;
//     }

//     // Parallel Fetch
//     const [supplier, purchases, payments] = await Promise.all([
//         Supplier.findOne({ _id: id, organizationId }),
//         Purchase.find({
//             ...queryFilter,
//             ...(startDate ? { purchaseDate: dateFilter } : {})
//         }).sort({ purchaseDate: 1 }),
//         Payment.find({
//             ...queryFilter,
//             type: 'outflow',
//             status: 'completed',
//             ...(startDate ? { paymentDate: dateFilter } : {})
//         }).sort({ paymentDate: 1 })
//     ]);

//     if (!supplier) return next(new AppError('Supplier not found', 404));

//     // Workbook Setup
//     const workbook = new ExcelJS.Workbook();
//     workbook.creator = 'ERP System';
//     workbook.created = new Date();

//     // --- SHEET 1: SUMMARY ---
//     const summarySheet = workbook.addWorksheet('Summary');
//     const headerStyle = { font: { bold: true, size: 12 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } } };

//     summarySheet.columns = [{ width: 25 }, { width: 35 }];
//     summarySheet.addRow(['SUPPLIER LEDGER REPORT']).font = { bold: true, size: 16 };
//     summarySheet.addRow([`Date Range:`, startDate ? `${startDate} to ${endDate}` : 'All Time']);
//     summarySheet.addRow([]); 

//     summarySheet.addRow(['Company Name', supplier.companyName]);
//     summarySheet.addRow(['GST Number', supplier.gstNumber || '-']);
//     summarySheet.addRow([]);

//     const totalBilled = purchases.reduce((sum, p) => sum + p.grandTotal, 0);
//     const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
//     summarySheet.addRow(['Total Billed', totalBilled]);
//     summarySheet.addRow(['Total Paid', totalPaid]);
//     summarySheet.addRow(['Net Movement', totalBilled - totalPaid]); // Not necessarily closing balance, just movement

//     // --- SHEET 2: BILLS ---
//     const billSheet = workbook.addWorksheet('Bills');
//     billSheet.columns = [
//         { header: 'Date', key: 'date', width: 15 },
//         { header: 'Invoice No', key: 'invoice', width: 20 },
//         { header: 'Total', key: 'total', width: 15 },
//         { header: 'Balance', key: 'balance', width: 15 },
//         { header: 'Status', key: 'status', width: 15 },
//     ];
//     billSheet.getRow(1).eachCell(c => c.style = headerStyle);

//     purchases.forEach(p => {
//         billSheet.addRow({
//             date: p.purchaseDate ? new Date(p.purchaseDate).toLocaleDateString() : '-',
//             invoice: p.invoiceNumber,
//             total: p.grandTotal,
//             balance: p.balanceAmount,
//             status: p.paymentStatus.toUpperCase()
//         });
//     });

//     // --- SHEET 3: PAYMENTS ---
//     const paySheet = workbook.addWorksheet('Payments');
//     paySheet.columns = [
//         { header: 'Date', key: 'date', width: 15 },
//         { header: 'Ref No', key: 'ref', width: 20 },
//         { header: 'Method', key: 'method', width: 15 },
//         { header: 'Amount', key: 'amount', width: 15 },
//     ];
//     paySheet.getRow(1).eachCell(c => c.style = headerStyle);

//     payments.forEach(pay => {
//         paySheet.addRow({
//             date: pay.paymentDate ? new Date(pay.paymentDate).toLocaleDateString() : '-',
//             ref: pay.referenceNumber || '-',
//             method: pay.paymentMethod.toUpperCase(),
//             amount: pay.amount
//         });
//     });

//     // Send File
//     res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//     res.setHeader('Content-Disposition', `attachment; filename=Supplier_${supplier.companyName.replace(/\s+/g,'_')}.xlsx`);

//     await workbook.xlsx.write(res);
//     res.end();
// });

// const fileUploadService = require('../../../core/services/fileUploadService'); // Assuming this is your service
// const cloudinary = require('cloudinary').v2;


// /* ===================================================
//    ✅ KYC DOCUMENT MANAGEMENT
// ==================================================== */
// exports.uploadKycDocument = catchAsync(async (req, res, next) => {
//   const { docType } = req.body;
//   if (!req.file || !docType) {
//     return next(new AppError("File and docType are required", 400));
//   }

//   const supplier = await Supplier.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!supplier) return next(new AppError("Supplier not found", 404));

//   // Upload to Cloudinary
//   const uploadResult = await fileUploadService.uploadFile(req.file.buffer, "suppliers/kyc");

//   // Push to documents array
//   supplier.documents.push({
//     docType,
//     url: uploadResult.url,
//     public_id: uploadResult.public_id,
//     verified: false // Admin can verify later
//   });

//   await supplier.save();

//   res.status(200).json({ status: "success", message: "Document uploaded", data: { supplier } });
// });

// exports.deleteKycDocument = catchAsync(async (req, res, next) => {
//   const supplier = await Supplier.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!supplier) return next(new AppError("Supplier not found", 404));

//   const docIndex = req.params.docIndex;
//   const doc = supplier.documents[docIndex];
  
//   if (!doc) return next(new AppError("Document not found", 404));

//   // Delete from Cloudinary
//   if (doc.public_id) {
//     try { await cloudinary.uploader.destroy(doc.public_id); } 
//     catch (err) { console.warn("Cloudinary delete failed", err); }
//   }

//   supplier.documents.splice(docIndex, 1);
//   await supplier.save();

//   res.status(200).json({ status: "success", message: "Document deleted" });
// });

















// // const Supplier = require('./supplier.model');
// // const Purchase = require('../../inventory/core/purchase.model');
// // const Payment = require('../../accounting/payments/payment.model');
// // const factory = require('../../../core/utils/api/handlerFactory');
// // const catchAsync = require("../../../core/utils/api/catchAsync");
// // const AppError = require("../../../core/utils/api/appError");
// // const mongoose = require('mongoose');
// // const imageUploadService = require("../../_legacy/services/uploads/imageUploadService");
// // const ExcelJS = require('exceljs'); // 🟢 ADDED MISSING IMPORT
// // // Standard CRUD
// // exports.createSupplier = factory.createOne(Supplier);
// // exports.createbulkSupplier = factory.bulkCreate(Supplier);
// // exports.getAllSuppliers = factory.getAll(Supplier);
// // exports.getSupplier = factory.getOne(Supplier);
// // exports.updateSupplier = factory.updateOne(Supplier);
// // exports.deleteSupplier = factory.deleteOne(Supplier);
// // exports.restoreSupplier = factory.restoreOne(Supplier);

// // // Dropdown list
// // exports.getSupplierList = catchAsync(async (req, res, next) => {
// //   const suppliers = await Supplier.find({
// //     organizationId: req.user.organizationId,
// //     isDeleted: { $ne: true },
// //   }).select('companyName phone gstNumber');

// //   res.status(200).json({
// //     status: 'success',
// //     results: suppliers.length,
// //     data: { suppliers },
// //   });
// // });

// // // Search
// // exports.searchSuppliers = catchAsync(async (req, res, next) => {
// //   const q = req.query.q || "";
// //   const org = req.user.organizationId;

// //   const suppliers = await Supplier.find({
// //     organizationId: org,
// //     isDeleted: false,
// //     $or: [
// //       { companyName: { $regex: q, $options: "i" } },
// //       { contactPerson: { $regex: q, $options: "i" } },
// //       { phone: { $regex: q, $options: "i" } },
// //       { altPhone: { $regex: q, $options: "i" } },
// //       { gstNumber: { $regex: q, $options: "i" } },
// //       { panNumber: { $regex: q, $options: "i" } },
// //     ]
// //   }).limit(50);

// //   res.status(200).json({
// //     status: "success",
// //     results: suppliers.length,
// //     data: { suppliers },
// //   });
// // });

// // /* ===================================================
// //    🔥 NEW: Supplier Financial Dashboard
// // ==================================================== */
// // exports.getSupplierDashboard = catchAsync(async (req, res, next) => {
// //   const { id } = req.params;
// //   const organizationId = req.user.organizationId;
// //   const supplierObjectId = new mongoose.Types.ObjectId(id);

// //   // 1. Validate Supplier Existence
// //   const supplier = await Supplier.findOne({ 
// //     _id: supplierObjectId, 
// //     organizationId,
// //     isDeleted: false 
// //   });

// //   if (!supplier) {
// //     return next(new AppError('No supplier found with that ID', 404));
// //   }

// //   // 2. Parallel Data Fetching for Performance
// //   const [purchaseStats, paymentStats, recentPurchases, recentPayments] = await Promise.all([
    
// //     // A. Purchase Stats (Total Billed, Total Pending Bills)
// //     Purchase.aggregate([
// //       { $match: { 
// //           organizationId: new mongoose.Types.ObjectId(organizationId), 
// //           supplierId: supplierObjectId,
// //           isDeleted: false,
// //           status: { $ne: 'cancelled' }
// //       }},
// //       { $group: {
// //           _id: null,
// //           totalPurchased: { $sum: "$grandTotal" },
// //           totalBalancePending: { $sum: "$balanceAmount" },
// //           count: { $sum: 1 },
// //           avgTicketSize: { $avg: "$grandTotal" }
// //       }}
// //     ]),

// //     // B. Payment Stats (Total Paid Out)
// //     Payment.aggregate([
// //       { $match: { 
// //           organizationId: new mongoose.Types.ObjectId(organizationId), 
// //           supplierId: supplierObjectId,
// //           type: 'outflow', // Only money going OUT to supplier
// //           status: 'completed',
// //           isDeleted: false
// //       }},
// //       { $group: {
// //           _id: null,
// //           totalPaid: { $sum: "$amount" },
// //           count: { $sum: 1 }
// //       }}
// //     ]),

// //     // C. Recent 5 Purchases (The "Bills")
// //     Purchase.find({ 
// //       organizationId, 
// //       supplierId: supplierObjectId,
// //       isDeleted: false 
// //     })
// //     .select('invoiceNumber purchaseDate grandTotal paymentStatus balanceAmount dueDate')
// //     .sort({ purchaseDate: -1 })
// //     .limit(5),

// //     // D. Recent 5 Payments
// //     Payment.find({ 
// //       organizationId, 
// //       supplierId: supplierObjectId, 
// //       type: 'outflow',
// //       isDeleted: false
// //     })
// //     .select('referenceNumber paymentDate amount paymentMethod status')
// //     .sort({ paymentDate: -1 })
// //     .limit(5)
// //   ]);

// //   // 3. Data Parsing (Aggregations return arrays, so pick the first item)
// //   const pStats = purchaseStats[0] || { totalPurchased: 0, totalBalancePending: 0, count: 0 };
// //   const payStats = paymentStats[0] || { totalPaid: 0, count: 0 };

// //   // 4. Construct the Final Response
// //   const dashboardData = {
// //     profile: {
// //       _id: supplier._id,
// //       companyName: supplier.companyName,
// //       contactPerson: supplier.contactPerson,
// //       email: supplier.email,
// //       phone: supplier.phone,
// //       gstNumber: supplier.gstNumber,
// //       avatar: supplier.avatar
// //     },
// //     financials: {
// //       totalVolume: pStats.totalPurchased,       // Total Lifetime Purchase Value
// //       totalPaid: payStats.totalPaid,            // Total Lifetime Paid
// //       outstanding: pStats.totalBalancePending,  // Calculated dynamically from Purchases
// //       walletBalance: supplier.openingBalance,   // If you use this for specific ledger adjustments
// //       totalInvoices: pStats.count
// //     },
// //     tables: {
// //       recentPurchases, // Array of last 5 bills
// //       recentPayments   // Array of last 5 transactions
// //     }
// //   };

// //   res.status(200).json({
// //     status: 'success',
// //     data: dashboardData
// //   });
// // });

// // exports.downloadSupplierLedger = catchAsync(async (req, res, next) => {
// //     const { id } = req.params;
// //     const { startDate, endDate } = req.query;
// //     const organizationId = req.user.organizationId;

// //     // 1. Define Date Range (Default to "All Time" if not provided)
// //     const queryFilter = {
// //         organizationId: new mongoose.Types.ObjectId(organizationId),
// //         supplierId: new mongoose.Types.ObjectId(id),
// //         isDeleted: false
// //     };

// //     const dateFilter = {};
// //     if (startDate && endDate) {
// //         dateFilter.$gte = new Date(startDate);
// //         dateFilter.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
// //     }

// //     // 2. Fetch Data in Parallel
// //     const [supplier, purchases, payments] = await Promise.all([
// //         Supplier.findOne({ _id: id, organizationId }),
// //         Purchase.find({
// //             ...queryFilter,
// //             ...(startDate ? { purchaseDate: dateFilter } : {})
// //         }).sort({ purchaseDate: 1 }),
// //         Payment.find({
// //             ...queryFilter,
// //             type: 'outflow',
// //             status: 'completed',
// //             ...(startDate ? { paymentDate: dateFilter } : {})
// //         }).sort({ paymentDate: 1 })
// //     ]);

// //     if (!supplier) return next(new AppError('Supplier not found', 404));

// //     // 3. Create Workbook & Sheets
// //     const workbook = new ExcelJS.Workbook();
// //     workbook.creator = 'Your App Name';
// //     workbook.created = new Date();

// //     // --- SHEET 1: SUMMARY ---
// //     const summarySheet = workbook.addWorksheet('Summary');
    
// //     // Styling helper
// //     const headerStyle = { font: { bold: true, size: 12 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } } };

// //     summarySheet.columns = [{ width: 25 }, { width: 35 }];
// //     summarySheet.addRow(['SUPPLIER LEDGER REPORT']).font = { bold: true, size: 16 };
// //     summarySheet.addRow([`Generated on: ${new Date().toLocaleDateString()}`]);
// //     summarySheet.addRow([]); // Empty row
    
// //     // Supplier Details
// //     summarySheet.addRow(['Company Name', supplier.companyName]);
// //     summarySheet.addRow(['Contact Person', supplier.contactPerson || 'N/A']);
// //     summarySheet.addRow(['Phone', supplier.phone || 'N/A']);
// //     summarySheet.addRow(['GST Number', supplier.gstNumber || 'N/A']);
// //     summarySheet.addRow([]);

// //     // Financial Totals for this period
// //     const totalBilled = purchases.reduce((sum, p) => sum + p.grandTotal, 0);
// //     const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
// //     summarySheet.addRow(['Total Billed (Period)', totalBilled]);
// //     summarySheet.addRow(['Total Paid (Period)', totalPaid]);
// //     summarySheet.addRow(['Net Balance (Period)', totalBilled - totalPaid]);
    
// //     // Style the summary rows
// //     summarySheet.eachRow((row, rowNumber) => {
// //         if(rowNumber > 3 && rowNumber < 9) row.getCell(1).font = { bold: true };
// //     });

// //     // --- SHEET 2: BILLS (Purchases) ---
// //     const billSheet = workbook.addWorksheet('Bills & Invoices');
// //     billSheet.columns = [
// //         { header: 'Date', key: 'date', width: 15 },
// //         { header: 'Invoice No', key: 'invoice', width: 20 },
// //         { header: 'Status', key: 'status', width: 15 },
// //         { header: 'Due Date', key: 'due', width: 15 },
// //         { header: 'Total Amount', key: 'total', width: 15 },
// //         { header: 'Balance Due', key: 'balance', width: 15 },
// //     ];

// //     // Apply Header Style
// //     billSheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });

// //     purchases.forEach(p => {
// //         billSheet.addRow({
// //             date: p.purchaseDate ? new Date(p.purchaseDate).toLocaleDateString() : '-',
// //             invoice: p.invoiceNumber,
// //             status: p.paymentStatus.toUpperCase(),
// //             due: p.dueDate ? new Date(p.dueDate).toLocaleDateString() : '-',
// //             total: p.grandTotal,
// //             balance: p.balanceAmount
// //         });
// //     });

// //     // --- SHEET 3: PAYMENTS ---
// //     const paySheet = workbook.addWorksheet('Payment History');
// //     paySheet.columns = [
// //         { header: 'Date', key: 'date', width: 15 },
// //         { header: 'Reference No', key: 'ref', width: 20 },
// //         { header: 'Method', key: 'method', width: 15 },
// //         { header: 'Remarks', key: 'remarks', width: 30 },
// //         { header: 'Amount Paid', key: 'amount', width: 15 },
// //     ];

// //     paySheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });

// //     payments.forEach(pay => {
// //         paySheet.addRow({
// //             date: pay.paymentDate ? new Date(pay.paymentDate).toLocaleDateString() : '-',
// //             ref: pay.referenceNumber || '-',
// //             method: pay.paymentMethod.toUpperCase(),
// //             remarks: pay.remarks || '-',
// //             amount: pay.amount
// //         });
// //     });

// //     // 4. Send Response
// //     res.setHeader(
// //         'Content-Type',
// //         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
// //     );
// //     res.setHeader(
// //         'Content-Disposition',
// //         `attachment; filename=Supplier_Ledger_${supplier.companyName.replace(/ /g,'_')}.xlsx`
// //     );

// //     await workbook.xlsx.write(res);
// //     res.end();
// // });
