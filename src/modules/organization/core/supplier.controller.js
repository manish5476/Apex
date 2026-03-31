const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

// Models
const Supplier       = require('./supplier.model');
const Purchase       = require('../../inventory/core/model/purchase.model');
const Payment        = require('../../accounting/payments/payment.model');
const PurchaseReturn = require('../../inventory/core/model/purchase.return.model');

// Utils
const factory       = require('../../../core/utils/api/handlerFactory');
const catchAsync    = require('../../../core/utils/api/catchAsync');
const AppError      = require('../../../core/utils/api/appError');
const fileUploadService  = require('../../uploads/fileUploadService');  // for KYC docs (PDFs)
const imageUploadService = require('../../uploads/imageUploadService'); // for avatar only

// Escape regex special chars — prevents ReDoS
const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

// ======================================================
// FACTORY DELEGATES
// ======================================================

// createSupplier injects organizationId via the route (see createSupplier below)
exports.getSupplier      = factory.getOne(Supplier);
exports.getAllSuppliers   = factory.getAll(Supplier);
exports.updateSupplier   = factory.updateOne(Supplier);
exports.restoreSupplier  = factory.restoreOne(Supplier);
exports.createbulkSupplier = factory.bulkCreate(Supplier);

// ======================================================
// CREATE SUPPLIER (with org injection)
// POST /suppliers
// ======================================================
exports.createSupplier = catchAsync(async (req, res, next) => {
  // Always force organizationId from the authenticated user — never trust req.body
  req.body.organizationId = req.user.organizationId;
  req.body.createdBy      = req.user.id;

  const supplier = await Supplier.create(req.body);

  res.status(201).json({
    status: 'success',
    data: { data: supplier },
  });
});

// ======================================================
// DELETE SUPPLIER (safe — with integrity checks)
// DELETE /suppliers/:id
// ======================================================
exports.deleteSupplier = catchAsync(async (req, res, next) => {
  const supplierId = req.params.id;
  const orgId      = req.user.organizationId;

  const supplier = await Supplier.findOne({ _id: supplierId, organizationId: orgId });
  if (!supplier) return next(new AppError('Supplier not found', 404));

  // 1. Block if active (non-cancelled) purchases exist
  const hasActivePurchases = await Purchase.exists({
    supplierId,
    organizationId: orgId,
    isDeleted: false,
    status: { $ne: 'cancelled' },
  });
  if (hasActivePurchases)
    return next(new AppError(
      'CANNOT DELETE: This supplier has active purchase orders. ' +
      'Cancel all purchases first or mark the supplier as Inactive.',
      409
    ));

  // 2. Block if outstanding balance exists (float tolerance: < ₹1)
  if (Math.abs(supplier.outstandingBalance) > 1)
    return next(new AppError(
      `CANNOT DELETE: This supplier has an outstanding balance of ₹${supplier.outstandingBalance}. ` +
      'Settle the balance before deleting.',
      409
    ));

  // Soft delete
  supplier.isDeleted = true;
  supplier.isActive  = false;
  await supplier.save();

  res.status(200).json({
    status: 'success',
    message: 'Supplier deleted successfully.',
  });
});

// ======================================================
// SUPPLIER LIST (dropdown-safe)
// GET /suppliers/list
// ======================================================
exports.getSupplierList = catchAsync(async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit) || 500, 500);

  const suppliers = await Supplier.find({
    organizationId: req.user.organizationId,
    isActive: true,
    isDeleted: false,
  })
    .select('companyName phone gstNumber')
    .sort({ companyName: 1 })
    .limit(limit);

  res.status(200).json({
    status: 'success',
    results: suppliers.length,
    data: { suppliers },
  });
});

// ======================================================
// SEARCH SUPPLIERS
// GET /suppliers/search?q=...
// ======================================================
exports.searchSuppliers = catchAsync(async (req, res, next) => {
  const q = req.query.q;
  if (!q)
    return res.status(200).json({ status: 'success', results: 0, data: { suppliers: [] } });

  const regex = new RegExp(escapeRegex(q), 'i');

  const suppliers = await Supplier.find({
    organizationId: req.user.organizationId,
    isDeleted: false,
    $or: [
      { companyName:   regex },
      { contactPerson: regex },
      { phone:         regex },
      { altPhone:      regex },
      { gstNumber:     regex },
      { panNumber:     regex },
    ],
  })
    .select('companyName contactPerson phone gstNumber avatar isActive')
    .limit(50);

  res.status(200).json({
    status: 'success',
    results: suppliers.length,
    data: { suppliers },
  });
});

// ======================================================
// SUPPLIER FINANCIAL DASHBOARD
// GET /suppliers/:id/dashboard
// ======================================================
exports.getSupplierDashboard = catchAsync(async (req, res, next) => {
  const { id }         = req.params;
  const organizationId = req.user.organizationId;

  if (!mongoose.Types.ObjectId.isValid(id))
    return next(new AppError('Invalid ID format', 400));

  const supplierObjectId  = new mongoose.Types.ObjectId(id);
  const organizationObjId = new mongoose.Types.ObjectId(organizationId);

  const supplier = await Supplier.findOne({
    _id: supplierObjectId,
    organizationId,
    isDeleted: false,
  });
  if (!supplier) return next(new AppError('No supplier found with that ID', 404));

  const [purchaseStats, paymentStats, returnStats, recentPurchases, recentPayments] = await Promise.all([

    // A. Purchase totals
    Purchase.aggregate([
      { $match: {
        organizationId: organizationObjId,
        supplierId: supplierObjectId,
        isDeleted: false,
        status: { $ne: 'cancelled' },
      }},
      { $group: {
        _id: null,
        totalPurchased:      { $sum: '$grandTotal' },
        totalBalancePending: { $sum: '$balanceAmount' },
        count:               { $sum: 1 },
      }},
    ]),

    // B. Payment totals (outflows to this supplier)
    Payment.aggregate([
      { $match: {
        organizationId: organizationObjId,
        supplierId: supplierObjectId,
        type: 'outflow',
        status: 'completed',
        isDeleted: false,
      }},
      { $group: {
        _id:      null,
        totalPaid: { $sum: '$amount' },
        count:     { $sum: 1 },
      }},
    ]),

    // C. Return/defect stats
    PurchaseReturn.aggregate([
      { $match: {
        organizationId: organizationObjId,
        supplierId: supplierObjectId,
      }},
      { $group: {
        _id:                 null,
        totalReturnedAmount: { $sum: '$totalAmount' },
        returnCount:         { $sum: 1 },
      }},
    ]),

    // D. Recent purchases
    Purchase.find({
      organizationId,
      supplierId: supplierObjectId,
      isDeleted: false,
    })
      .select('invoiceNumber purchaseDate grandTotal paymentStatus balanceAmount dueDate')
      .sort({ purchaseDate: -1 })
      .limit(5)
      .lean(),

    // E. Recent payments
    Payment.find({
      organizationId,
      supplierId: supplierObjectId,
      type: 'outflow',
      isDeleted: false,
    })
      .select('referenceNumber paymentDate amount paymentMethod status')
      .sort({ paymentDate: -1 })
      .limit(5)
      .lean(),
  ]);

  const pStats   = purchaseStats[0] || { totalPurchased: 0, totalBalancePending: 0, count: 0 };
  const payStats = paymentStats[0]  || { totalPaid: 0, count: 0 };
  const retStats = returnStats[0]   || { totalReturnedAmount: 0, returnCount: 0 };

  // Ledger balance: what we still owe
  // Returns are NOT subtracted here — they're already reflected in Purchase.balanceAmount.
  // They're shown separately under performance for visibility.
  const currentLedgerBalance =
    (supplier.openingBalance || 0) + pStats.totalPurchased - payStats.totalPaid;

  const defectRate = pStats.totalPurchased > 0
    ? ((retStats.totalReturnedAmount / pStats.totalPurchased) * 100).toFixed(2)
    : 0;

  res.status(200).json({
    status: 'success',
    data: {
      profile: {
        _id:           supplier._id,
        companyName:   supplier.companyName,
        contactPerson: supplier.contactPerson,
        contacts:      supplier.contacts,
        email:         supplier.email,
        phone:         supplier.phone,
        gstNumber:     supplier.gstNumber,
        creditLimit:   supplier.creditLimit,
        avatar:        supplier.avatar,
      },
      financials: {
        totalVolume:   pStats.totalPurchased,
        totalPaid:     payStats.totalPaid,
        outstanding:   pStats.totalBalancePending,
        ledgerBalance: currentLedgerBalance,
        totalInvoices: pStats.count,
      },
      performance: {
        totalReturnedValue: retStats.totalReturnedAmount,
        returnCount:        retStats.returnCount,
        defectRatePercent:  Number(defectRate),
      },
      recentPurchases,
      recentPayments,
    },
  });
});

// ======================================================
// EXCEL LEDGER DOWNLOAD
// GET /suppliers/:id/ledger-export?startDate=&endDate=
// ======================================================
exports.downloadSupplierLedger = catchAsync(async (req, res, next) => {
  const { id }                 = req.params;
  const { startDate, endDate } = req.query;
  const organizationId         = req.user.organizationId;

  const baseFilter = {
    organizationId: new mongoose.Types.ObjectId(organizationId),
    supplierId:     new mongoose.Types.ObjectId(id),
    isDeleted: false,
  };

  // Build date filters independently — each date is optional
  const purchaseDateFilter = {};
  const paymentDateFilter  = {};

  if (startDate) {
    purchaseDateFilter.$gte = new Date(startDate);
    paymentDateFilter.$gte  = new Date(startDate);
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    purchaseDateFilter.$lte = end;
    paymentDateFilter.$lte  = end;
  }

  const [supplier, purchases, payments] = await Promise.all([
    Supplier.findOne({ _id: id, organizationId }).lean(),
    Purchase.find({
      ...baseFilter,
      ...(Object.keys(purchaseDateFilter).length ? { purchaseDate: purchaseDateFilter } : {}),
    }).sort({ purchaseDate: 1 }).lean(),
    Payment.find({
      ...baseFilter,
      type: 'outflow',
      status: 'completed',
      ...(Object.keys(paymentDateFilter).length ? { paymentDate: paymentDateFilter } : {}),
    }).sort({ paymentDate: 1 }).lean(),
  ]);

  if (!supplier) return next(new AppError('Supplier not found', 404));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ERP System';
  workbook.created = new Date();

  const headerStyle = {
    font: { bold: true, size: 12 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } },
  };

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '-');

  // --- SHEET 1: SUMMARY ---
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [{ width: 25 }, { width: 35 }];
  summarySheet.addRow(['SUPPLIER LEDGER REPORT']).font = { bold: true, size: 16 };

  const rangeLabel = startDate || endDate
    ? `${startDate || 'Beginning'} to ${endDate || 'Present'}`
    : 'All Time';
  summarySheet.addRow(['Date Range:', rangeLabel]);
  summarySheet.addRow([]);
  summarySheet.addRow(['Company Name', supplier.companyName]);
  summarySheet.addRow(['GST Number',   supplier.gstNumber || '-']);
  summarySheet.addRow([]);

  const totalBilled = purchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);
  const totalPaid   = payments.reduce((sum, p)  => sum + (p.amount   || 0), 0);

  summarySheet.addRow(['Total Billed', totalBilled]);
  summarySheet.addRow(['Total Paid',   totalPaid]);
  summarySheet.addRow(['Net Movement', totalBilled - totalPaid]);

  // --- SHEET 2: BILLS ---
  const billSheet = workbook.addWorksheet('Bills');
  billSheet.columns = [
    { header: 'Date',       key: 'date',    width: 15 },
    { header: 'Invoice No', key: 'invoice', width: 20 },
    { header: 'Total',      key: 'total',   width: 15 },
    { header: 'Balance',    key: 'balance', width: 15 },
    { header: 'Status',     key: 'status',  width: 15 },
  ];
  billSheet.getRow(1).eachCell(c => { c.style = headerStyle; });

  purchases.forEach(p => {
    billSheet.addRow({
      date:    formatDate(p.purchaseDate),
      invoice: p.invoiceNumber || '-',
      total:   p.grandTotal    || 0,
      balance: p.balanceAmount || 0,
      status:  (p.paymentStatus || '').toUpperCase(),
    });
  });

  // --- SHEET 3: PAYMENTS ---
  const paySheet = workbook.addWorksheet('Payments');
  paySheet.columns = [
    { header: 'Date',   key: 'date',   width: 15 },
    { header: 'Ref No', key: 'ref',    width: 20 },
    { header: 'Method', key: 'method', width: 15 },
    { header: 'Amount', key: 'amount', width: 15 },
  ];
  paySheet.getRow(1).eachCell(c => { c.style = headerStyle; });

  payments.forEach(pay => {
    paySheet.addRow({
      date:   formatDate(pay.paymentDate),
      ref:    pay.referenceNumber || '-',
      method: (pay.paymentMethod || '').toUpperCase(),
      amount: pay.amount || 0,
    });
  });

  const safeFilename = supplier.companyName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=Supplier_${safeFilename}.xlsx`);

  await workbook.xlsx.write(res);
  res.end();
});

// ======================================================
// UPLOAD KYC DOCUMENT
// POST /suppliers/:id/kyc
// ======================================================
exports.uploadKycDocument = catchAsync(async (req, res, next) => {
  const { docType } = req.body;

  if (!req.file || !req.file.buffer)
    return next(new AppError('File is required', 400));
  if (!docType)
    return next(new AppError('Document type is required', 400));

  const supplier = await Supplier.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });
  if (!supplier) return next(new AppError('Supplier not found', 404));

  // KYC docs are PDFs/files — use fileUploadService, NOT imageUploadService
  // imageUploadService applies Cloudinary image transforms which break PDFs
  const asset = await fileUploadService.uploadAndRecord(req.file, req.user, 'kyc');

  supplier.documents.push({
    docType,
    url:      asset.url,
    public_id: asset.publicId, // legacy compat
    assetId:  asset._id,
    verified: false,
  });

  await supplier.save();

  // Don't expose full supplier doc — just the new document entry
  const newDoc = supplier.documents[supplier.documents.length - 1];

  res.status(200).json({
    status: 'success',
    message: 'KYC document uploaded successfully.',
    data: { document: newDoc },
  });
});

// ======================================================
// DELETE KYC DOCUMENT
// DELETE /suppliers/:id/kyc/:docId
// ======================================================
exports.deleteKycDocument = catchAsync(async (req, res, next) => {
  const supplier = await Supplier.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });
  if (!supplier) return next(new AppError('Supplier not found', 404));

  // Use _id-based lookup — safe against race conditions and stale indexes
  const doc = supplier.documents.id(req.params.docId);
  if (!doc) return next(new AppError('Document not found', 404));

  // 1. Delete from Cloudinary + Asset collection
  if (doc.assetId) {
    try {
      await fileUploadService.deleteFullAsset(doc.assetId, req.user.organizationId);
    } catch (err) {
      console.warn(`KYC asset deletion failed for ${doc.assetId}:`, err.message);
    }
  } else if (doc.public_id) {
    // Fallback: older docs uploaded before the Asset system
    try {
      await fileUploadService.deleteFile(doc.public_id);
    } catch (err) {
      console.warn('Fallback Cloudinary delete failed:', err.message);
    }
  }

  // 2. Remove from array using Mongoose subdoc .deleteOne()
  doc.deleteOne();
  await supplier.save();

  res.status(200).json({
    status: 'success',
    message: 'KYC document permanently deleted.',
  });
});



// const mongoose = require('mongoose');
// const ExcelJS = require('exceljs');
// const cloudinary = require('cloudinary').v2;

// // Models
// const Supplier = require('./supplier.model');
// const Purchase = require('../../inventory/core/model/purchase.model'); 
// const Payment = require('../../accounting/payments/payment.model');
// const PurchaseReturn = require('../../inventory/core/model/purchase.return.model'); // 🟢 Added for Defect Rate

// // Utils & Services
// const factory = require('../../../core/utils/api/handlerFactory');
// const catchAsync = require("../../../core/utils/api/catchAsync");
// const AppError = require("../../../core/utils/api/appError");
// const fileUploadService = require('../../uploads/fileUploadService');
// const imageUploadService =  require('../../uploads/imageUploadService');
// // Helper: Escape Regex Special Characters to prevent crashes
// const escapeRegex = (text) => {
//   return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
// };

// /* ===================================================
//    Standard CRUD (Factory)
// ==================================================== */
// exports.createSupplier = factory.createOne(Supplier);
// exports.createbulkSupplier = factory.bulkCreate(Supplier);
// exports.getAllSuppliers = factory.getAll(Supplier);
// exports.getSupplier = factory.getOne(Supplier);
// exports.updateSupplier = factory.updateOne(Supplier);
// exports.deleteSupplier = factory.deleteOne(Supplier);
// exports.restoreSupplier = factory.restoreOne(Supplier);

// /* ===================================================
//    Dropdown List (Safe Version)
// ==================================================== */
// exports.getSupplierList = catchAsync(async (req, res, next) => {
//   const suppliers = await Supplier.find({
//     organizationId: req.user.organizationId,
//     isActive: true, // Ensure only active suppliers show in dropdowns
//     isDeleted: false,
//   })
//   .select('companyName phone gstNumber')
//   .limit(500); // 🟢 Limit added to prevent browser crash on huge databases

//   res.status(200).json({
//     status: 'success',
//     results: suppliers.length,
//     data: { suppliers },
//   });
// });

// /* ===================================================
//    Search API
// ==================================================== */
// exports.searchSuppliers = catchAsync(async (req, res, next) => {
//   const q = req.query.q;
//   if (!q) {
//       return res.status(200).json({ status: "success", results: 0, data: { suppliers: [] } });
//   }

//   const org = req.user.organizationId;
//   const regex = new RegExp(escapeRegex(q), 'i');

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
//   }).limit(50);

//   res.status(200).json({
//     status: "success",
//     results: suppliers.length,
//     data: { suppliers },
//   });
// });

// /* ===================================================
//    🔥 Supplier Financial Dashboard
// ==================================================== */
// exports.getSupplierDashboard = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const organizationId = req.user.organizationId;
  
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
//   const [purchaseStats, paymentStats, returnStats, recentPurchases, recentPayments] = await Promise.all([
    
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
//           count: { $sum: 1 }
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

//     // C. Return/Defect Stats (🟢 NEW)
//     PurchaseReturn.aggregate([
//       { $match: { 
//           organizationId: new mongoose.Types.ObjectId(organizationId), 
//           supplierId: supplierObjectId 
//       }},
//       { $group: {
//           _id: null,
//           totalReturnedAmount: { $sum: "$totalAmount" },
//           returnCount: { $sum: 1 }
//       }}
//     ]),

//     // D. Recent Bills
//     Purchase.find({ 
//       organizationId, 
//       supplierId: supplierObjectId,
//       isDeleted: false 
//     })
//     .select('invoiceNumber purchaseDate grandTotal paymentStatus balanceAmount dueDate')
//     .sort({ purchaseDate: -1 })
//     .limit(5),

//     // E. Recent Payments
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

//   // Extract Stats Safely
//   const pStats = purchaseStats[0] || { totalPurchased: 0, totalBalancePending: 0, count: 0 };
//   const payStats = paymentStats[0] || { totalPaid: 0, count: 0 };
//   const retStats = returnStats[0] || { totalReturnedAmount: 0, returnCount: 0 };

//   // Calculate Ledger Balance & Defect Rate
//   const currentLedgerBalance = (supplier.openingBalance || 0) + pStats.totalPurchased - payStats.totalPaid - retStats.totalReturnedAmount;
  
//   const defectRate = pStats.totalPurchased > 0 
//     ? ((retStats.totalReturnedAmount / pStats.totalPurchased) * 100).toFixed(2) 
//     : 0;

//   // 🟢 Fixed Data Structure Output
//   const dashboardData = {
//     profile: {
//       _id: supplier._id,
//       companyName: supplier.companyName,
//       contactPerson: supplier.contactPerson, // Fallback
//       contacts: supplier.contacts, // New Array
//       email: supplier.email,
//       phone: supplier.phone,
//       gstNumber: supplier.gstNumber,
//       creditLimit: supplier.creditLimit,
//       avatar: supplier.avatar
//     },
//     financials: {
//       totalVolume: pStats.totalPurchased,
//       totalPaid: payStats.totalPaid,
//       outstanding: pStats.totalBalancePending, 
//       walletBalance: currentLedgerBalance,
//       totalInvoices: pStats.count
//     },
//     performance: {
//       totalReturnedValue: retStats.totalReturnedAmount,
//       returnCount: retStats.returnCount,
//       defectRatePercent: Number(defectRate)
//     },
//     // Placed tables at root level for cleaner UI parsing
//     recentPurchases,
//     recentPayments
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

//     // 🟢 Fixed Date Filter Logic
//     const dateFilter = {};
//     if (startDate) {
//         dateFilter.$gte = new Date(startDate);
//         const end = endDate ? new Date(endDate) : new Date(); // Default to today if no endDate
//         end.setHours(23, 59, 59, 999);
//         dateFilter.$lte = end;
//     }

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

//     const workbook = new ExcelJS.Workbook();
//     workbook.creator = 'ERP System';
//     workbook.created = new Date();

//     const headerStyle = { font: { bold: true, size: 12 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } } };

//     // --- SHEET 1: SUMMARY ---
//     const summarySheet = workbook.addWorksheet('Summary');
//     summarySheet.columns = [{ width: 25 }, { width: 35 }];
//     summarySheet.addRow(['SUPPLIER LEDGER REPORT']).font = { bold: true, size: 16 };
//     summarySheet.addRow([`Date Range:`, startDate ? `${startDate} to ${endDate || 'Present'}` : 'All Time']);
//     summarySheet.addRow([]); 

//     summarySheet.addRow(['Company Name', supplier.companyName]);
//     summarySheet.addRow(['GST Number', supplier.gstNumber || '-']);
//     summarySheet.addRow([]);

//     const totalBilled = purchases.reduce((sum, p) => sum + p.grandTotal, 0);
//     const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
//     summarySheet.addRow(['Total Billed', totalBilled]);
//     summarySheet.addRow(['Total Paid', totalPaid]);
//     summarySheet.addRow(['Net Movement', totalBilled - totalPaid]);

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
//             date: p.purchaseDate ? new Date(p.purchaseDate).toLocaleDateString('en-IN') : '-', // 🟢 Fixed Date Format
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
//             date: pay.paymentDate ? new Date(pay.paymentDate).toLocaleDateString('en-IN') : '-', // 🟢 Fixed Date Format
//             ref: pay.referenceNumber || '-',
//             method: pay.paymentMethod.toUpperCase(),
//             amount: pay.amount
//         });
//     });

//     res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//     res.setHeader('Content-Disposition', `attachment; filename=Supplier_${supplier.companyName.replace(/\s+/g,'_')}.xlsx`);

//     await workbook.xlsx.write(res);
//     res.end();
// });

// /* ===================================================
//    ✅ KYC DOCUMENT MANAGEMENT (Asset-Tracked)
// ==================================================== */
// exports.uploadKycDocument = catchAsync(async (req, res, next) => {
//   const { docType } = req.body;
  
//   if (!req.file || !req.file.buffer) {
//     return next(new AppError("File is required", 400));
//   }
//   if (!docType) {
//     return next(new AppError("Document type is required", 400));
//   }

//   // 1. PRE-CHECK: Ensure Supplier exists before uploading anything
//   const supplier = await Supplier.findOne({ 
//     _id: req.params.id, 
//     organizationId: req.user.organizationId 
//   });
  
//   if (!supplier) return next(new AppError("Supplier not found", 404));

//   // 2. UPLOAD & RECORD: Categorize as 'kyc' for strict media gallery filtering
//   const asset = await imageUploadService.uploadAndRecord(req.file, req.user, 'kyc');

//   // 3. PUSH TO SUPPLIER ARRAY
//   supplier.documents.push({
//     docType,
//     url: asset.url,
//     public_id: asset.publicId, // Keep for legacy compatibility if needed
//     assetId: asset._id,        // NEW: The strict link to the Master Asset
//     verified: false            // Admin can verify later
//   });

//   await supplier.save();

//   res.status(200).json({ 
//     status: "success", 
//     message: "KYC Document uploaded and indexed securely.", 
//     data: { supplier } 
//   });
// });

// /* ===================================================
//    🗑️ KYC DOCUMENT DELETE (Master Cleanup)
// ==================================================== */
// exports.deleteKycDocument = catchAsync(async (req, res, next) => {
//   const supplier = await Supplier.findOne({ 
//     _id: req.params.id, 
//     organizationId: req.user.organizationId 
//   });
  
//   if (!supplier) return next(new AppError("Supplier not found", 404));

//   const docIndex = parseInt(req.params.docIndex, 10);
//   const doc = supplier.documents[docIndex];
  
//   if (!doc) return next(new AppError("Document not found at specified index", 404));

//   // 1. MASTER CLEANUP: Wipe from Cloudinary AND Database Asset Collection
//   if (doc.assetId) {
//     try {
//       await imageUploadService.deleteFullAsset(doc.assetId, req.user.organizationId);
//     } catch (err) {
//       console.warn(`⚠️ Master Asset deletion failed for KYC doc ${doc.assetId}:`, err.message);
//     }
//   } else if (doc.public_id) {
//     // Fallback for older KYC documents uploaded before the Asset System existed
//     try {
//       const { deleteFile } = require('../services/uploads/fileUploadService');
//       await deleteFile(doc.public_id);
//     } catch (err) {
//       console.warn("⚠️ Fallback Cloudinary delete failed:", err.message);
//     }
//   }

//   // 2. REMOVE FROM SUPPLIER RECORD
//   supplier.documents.splice(docIndex, 1);
//   await supplier.save();

//   res.status(200).json({ 
//     status: "success", 
//     message: "KYC Document permanently deleted from storage." 
//   });
// })

// // /* ===================================================
// //    ✅ KYC DOCUMENT MANAGEMENT
// // ==================================================== */
// // exports.uploadKycDocument = catchAsync(async (req, res, next) => {
// //   const { docType } = req.body;
// //   if (!req.file || !docType) {
// //     return next(new AppError("File and docType are required", 400));
// //   }

// //   const supplier = await Supplier.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
// //   if (!supplier) return next(new AppError("Supplier not found", 404));

// //   // Upload to Cloudinary
// //   const uploadResult = await fileUploadService.uploadFile(req.file.buffer, "suppliers/kyc");

// //   // Push to documents array
// //   supplier.documents.push({
// //     docType,
// //     url: uploadResult.url,
// //     public_id: uploadResult.public_id,
// //     verified: false // Admin can verify later
// //   });

// //   await supplier.save();

// //   res.status(200).json({ status: "success", message: "Document uploaded", data: { supplier } });
// // });

// // exports.deleteKycDocument = catchAsync(async (req, res, next) => {
// //   const supplier = await Supplier.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
// //   if (!supplier) return next(new AppError("Supplier not found", 404));

// //   const docIndex = req.params.docIndex;
// //   const doc = supplier.documents[docIndex];
  
// //   if (!doc) return next(new AppError("Document not found", 404));

// //   // Delete from Cloudinary
// //   if (doc.public_id) {
// //     try { await cloudinary.uploader.destroy(doc.public_id); } 
// //     catch (err) { console.warn("Cloudinary delete failed", err); }
// //   }

// //   supplier.documents.splice(docIndex, 1);
// //   await supplier.save();

// //   res.status(200).json({ status: "success", message: "Document deleted" });
// // });
