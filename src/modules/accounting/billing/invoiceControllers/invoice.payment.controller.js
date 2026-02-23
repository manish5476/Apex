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

const catchAsync = require("../../../../core/utils/catchAsync");
const AppError = require("../../../../core/utils/appError");
const factory = require("../../../../core/utils/handlerFactory");
const { runInTransaction } = require("../../../../core/utils/runInTransaction");
const { emitToOrg } = require("../../../../core/utils/_legacy/socket");
const automationService = require('../../../_legacy/services/automationService');
const EMI = require('../../payments/emi.model'); // Adjust path to your EMI model
const emiService = require('../../../_legacy/services/emiService'); // Adjust path to your Service
/* ======================================================
   4. ADD PAYMENT TO INVOICE (FIXED)
====================================================== */
/* ======================================================
   4. ADD PAYMENT TO INVOICE (INTELLIGENT BRIDGE)
====================================================== */
// exports.addPayment = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const { amount, paymentMethod, referenceNumber, transactionId, notes } = req.body;

//   // 1. Basic Validation
//   if (!amount || amount <= 0) {
//     return next(new AppError('Payment amount must be positive', 400));
//   }

//   // 2. 🔍 INTELLIGENT CHECK: Is this an EMI Invoice?
//   // We check this OUTSIDE the transaction because emiService starts its own transaction.
//   // MongoDB does not support nested transactions.
//   const existingEmi = await EMI.findOne({ 
//       invoiceId: id, 
//       status: { $ne: 'cancelled' } // Only check active EMIs
//   });

//   /* ============================================================
//      PATH A: EMI EXISTS -> DELEGATE TO EMI SERVICE
//      (This keeps EMI installments and Invoice status in sync)
//   ============================================================ */
//   if (existingEmi) {
//     // This service function will:
//     // 1. Create Payment record
//     // 2. Update Ledger
//     // 3. Mark EMI Installments as Paid
//     // 4. Update Invoice Paid Amount & Status automatically
//     await emiService.reconcileExternalPayment({
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId, // Ideally fetch this from invoice, but req.user.branchId works for context
//       invoiceId: id,
//       amount: Number(amount),
//       paymentMethod: paymentMethod || 'cash',
//       referenceNumber: referenceNumber,
//       transactionId: transactionId,
//       remarks: notes || 'Payment added via Invoice Screen',
//       createdBy: req.user._id
//     });

//     return res.status(200).json({
//       status: 'success',
//       message: 'Payment recorded and synced with EMI Plan'
//     });
//   }

//   /* ============================================================
//      PATH B: NO EMI -> STANDARD INVOICE PAYMENT
//      (Your existing logic for regular sales)
//   ============================================================ */
//   await runInTransaction(async (session) => {
//     const invoice = await Invoice.findOne({
//       _id: id,
//       organizationId: req.user.organizationId
//     }).session(session);

//     if (!invoice) throw new AppError('Invoice not found', 404);
//     if (invoice.status === 'cancelled') throw new AppError('Cannot add payment to cancelled invoice', 400);
//     if (invoice.status === 'paid') throw new AppError('Invoice already fully paid', 400);

//     const newPaidAmount = invoice.paidAmount + amount;
//     const newBalance = invoice.grandTotal - newPaidAmount;

//     if (newPaidAmount > invoice.grandTotal) {
//       throw new AppError(
//         `Payment exceeds invoice total. Maximum allowed: ${invoice.grandTotal - invoice.paidAmount}`,
//         400
//       );
//     }

//     // Store old values for audit
//     const oldValues = {
//       paidAmount: invoice.paidAmount,
//       balanceAmount: invoice.balanceAmount,
//       paymentStatus: invoice.paymentStatus,
//       status: invoice.status
//     };

//     // 1. Create Payment Record
//     const [payment] = await Payment.create([{
//         organizationId: req.user.organizationId,
//         branchId: invoice.branchId,
//         type: 'inflow',
//         customerId: invoice.customerId,
//         invoiceId: invoice._id,
//         paymentDate: new Date(),
//         amount: amount,
//         paymentMethod: paymentMethod || invoice.paymentMethod || 'cash',
//         transactionMode: 'manual',
//         referenceNumber: referenceNumber,
//         transactionId: transactionId,
//         remarks: notes || `Payment for Invoice #${invoice.invoiceNumber}`,
//         status: 'completed',
//         allocationStatus: 'fully_allocated',
//         remainingAmount: 0,
//         allocatedTo: [{
//             type: 'invoice',
//             documentId: invoice._id,
//             amount: amount,
//             allocatedAt: new Date()
//         }],
//         createdBy: req.user._id
//     }], { session });

//     // 2. Create Accounting Entries
//     // Helper to get/init account
//     const getOrInitAccount = async (orgId, type, name, code) => {
//         let account = await Account.findOne({ organizationId: orgId, code }).session(session);
//         if (!account) {
//              account = (await Account.create([{
//                 organizationId: orgId, name, code, type, isGroup: false, cachedBalance: 0
//             }], { session }))[0];
//         }
//         return account;
//     };

//     let accountName = 'Cash';
//     let accountCode = '1001';
//     const method = paymentMethod || invoice.paymentMethod || 'cash';
    
//     switch (method) {
//         case 'bank': case 'cheque': accountName = 'Bank'; accountCode = '1002'; break;
//         case 'upi': accountName = 'UPI Receivables'; accountCode = '1003'; break;
//         case 'card': accountName = 'Card Receivables'; accountCode = '1004'; break;
//     }

//     const [assetAccount, arAccount] = await Promise.all([
//         getOrInitAccount(req.user.organizationId, 'asset', accountName, accountCode),
//         getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200')
//     ]);

//     // Dr Asset
//     await AccountEntry.create([{
//         organizationId: req.user.organizationId,
//         branchId: invoice.branchId,
//         accountId: assetAccount._id,
//         date: new Date(),
//         debit: amount,
//         credit: 0,
//         description: `Payment for ${invoice.invoiceNumber}`,
//         referenceType: 'payment',
//         referenceId: invoice._id,
//         paymentId: payment._id,
//         createdBy: req.user._id
//     }], { session });

//     // Cr AR
//     await AccountEntry.create([{
//         organizationId: req.user.organizationId,
//         branchId: invoice.branchId,
//         accountId: arAccount._id,
//         customerId: invoice.customerId,
//         date: new Date(),
//         debit: 0,
//         credit: amount,
//         description: `Payment applied to ${invoice.invoiceNumber}`,
//         referenceType: 'payment',
//         referenceId: invoice._id,
//         paymentId: payment._id,
//         createdBy: req.user._id
//     }], { session });

//     // 3. Update Customer Balance
//     await Customer.findByIdAndUpdate(
//         invoice.customerId,
//         { $inc: { outstandingBalance: -amount } },
//         { session }
//     );

//     // Update invoice
//     invoice.paidAmount = newPaidAmount;
//     invoice.balanceAmount = newBalance;
    
//     if (newBalance <= 0) {
//       invoice.paymentStatus = 'paid';
//       invoice.status = 'paid';
//     } else {
//       invoice.paymentStatus = 'partial';
//     }

//     if (paymentMethod) invoice.paymentMethod = paymentMethod;
//     if (notes) invoice.notes = (invoice.notes || '') + `\nPayment: ${notes}`;

//     await invoice.save({ session });

//     // CREATE AUDIT LOG
//     await InvoiceAudit.create([{
//       invoiceId: invoice._id,
//       action: 'PAYMENT_ADDED',
//       performedBy: req.user._id,
//       details: `Payment of ${amount} added via ${paymentMethod}. New paid: ${newPaidAmount}/${invoice.grandTotal}`,
//       oldValues,
//       newValues: {
//         paidAmount: invoice.paidAmount,
//         balanceAmount: invoice.balanceAmount,
//         paymentStatus: invoice.paymentStatus,
//         status: invoice.status
//       },
//       ipAddress: req.ip
//     }], { session });

//   }, 3, { action: "ADD_PAYMENT", userId: req.user._id });

//   res.status(200).json({
//     status: 'success',
//     message: 'Payment added successfully'
//   });
// });

// /* ======================================================
//    5. GET INVOICE PAYMENTS
// ====================================================== */
exports.getInvoicePayments = catchAsync(async (req, res, next) => {
  const payments = await Payment.find({
    invoiceId: req.params.id,
    organizationId: req.user.organizationId,
    isDeleted: { $ne: true }
  })
  .sort({ paymentDate: -1 })
  .populate('createdBy', 'name email');

  res.status(200).json({ 
    status: 'success', 
    results: payments.length, 
    data: { payments } 
  });
});
/* ======================================================
   4. ADD PAYMENT TO INVOICE (MUTUALLY EXCLUSIVE LOGIC)
====================================================== */
exports.addPayment = catchAsync(async (req, res, next) => {
  // const { id } = req.params;
  // const { amount, paymentMethod, referenceNumber, transactionId, notes } = req.body;

  // if (!amount || amount <= 0) {
  //   return next(new AppError('Payment amount must be positive', 400));
  // }
const { id } = req.params;
  let { amount, paymentMethod, referenceNumber, transactionId, notes } = req.body; // Change const to let

  // 🛡️ SAFETY: Force amount to be a number
  amount = Number(amount); 

  if (!amount || amount <= 0 || isNaN(amount)) {
    return next(new AppError('Payment amount must be a positive number', 400));
  }
  // 1. CHECK FOR EMI (Outside Transaction)
  const existingEmi = await EMI.findOne({ 
      invoiceId: id, 
      status: { $ne: 'cancelled' } 
  });

  // ============================================================
  // PATH A: EMI EXISTS (Run THIS or PATH B, never both)
  // ============================================================
  if (existingEmi) {
    // This service handles EVERYTHING (Payment, Ledger, Invoice Update)
    await emiService.reconcileExternalPayment({
      organizationId: req.user.organizationId,
      branchId: req.user.branchId, 
      invoiceId: id,
      amount: Number(amount),
      paymentMethod: paymentMethod || 'cash',
      referenceNumber: referenceNumber,
      transactionId: transactionId,
      remarks: notes || 'Payment added via Invoice Screen',
      createdBy: req.user._id
    });

    // 🛑 RETURN IMMEDIATELY so Path B doesn't run
    return res.status(200).json({
      status: 'success',
      message: 'Payment recorded and synced with EMI Plan'
    });
  } 
  
  // ============================================================
  // PATH B: NO EMI (Standard Invoice Logic)
  // ============================================================
  else {
    await runInTransaction(async (session) => {
      const invoice = await Invoice.findOne({
        _id: id,
        organizationId: req.user.organizationId
      }).session(session);

      if (!invoice) throw new AppError('Invoice not found', 404);
      if (invoice.status === 'cancelled') throw new AppError('Cannot add payment to cancelled invoice', 400);
      if (invoice.status === 'paid') throw new AppError('Invoice already fully paid', 400);

      const newPaidAmount = invoice.paidAmount + amount;
      
      // Validation to prevent overpayment
      if (newPaidAmount > invoice.grandTotal) {
        throw new AppError(
          `Payment exceeds invoice total. Maximum allowed: ${invoice.grandTotal - invoice.paidAmount}`,
          400
        );
      }

      // 1. Create Payment Record
      const [payment] = await Payment.create([{
          organizationId: req.user.organizationId,
          branchId: invoice.branchId,
          type: 'inflow',
          customerId: invoice.customerId,
          invoiceId: invoice._id,
          paymentDate: new Date(),
          amount: amount,
          paymentMethod: paymentMethod || invoice.paymentMethod || 'cash',
          transactionMode: 'manual',
          referenceNumber: referenceNumber,
          transactionId: transactionId,
          remarks: notes || `Payment for Invoice #${invoice.invoiceNumber}`,
          status: 'completed',
          allocationStatus: 'fully_allocated',
          remainingAmount: 0,
          allocatedTo: [{
              type: 'invoice',
              documentId: invoice._id,
              amount: amount,
              allocatedAt: new Date()
          }],
          createdBy: req.user._id
      }], { session });

      // 2. Create Accounting Entries (Ledger)
      await createPaymentAccountingEntries({ 
          invoice, 
          payment, 
          userId: req.user._id, 
          session 
      });

      // 3. Update Customer Balance
      await Customer.findByIdAndUpdate(
          invoice.customerId,
          { $inc: { outstandingBalance: -amount } },
          { session }
      );

      // 4. Update Invoice Status
      invoice.paidAmount = newPaidAmount;
      invoice.balanceAmount = invoice.grandTotal - newPaidAmount;
      
      if (invoice.balanceAmount <= 0) {
        invoice.paymentStatus = 'paid';
        invoice.status = 'paid';
      } else {
        invoice.paymentStatus = 'partial';
      }

      if (paymentMethod) invoice.paymentMethod = paymentMethod;
      if (notes) invoice.notes = (invoice.notes || '') + `\nPayment: ${notes}`;

      await invoice.save({ session });

      // 5. Audit Log
      await InvoiceAudit.create([{
        invoiceId: invoice._id,
        action: 'PAYMENT_ADDED',
        performedBy: req.user._id,
        details: `Payment of ${amount} added. New paid: ${newPaidAmount}`,
        ipAddress: req.ip
      }], { session });

    }, 3, { action: "ADD_PAYMENT", userId: req.user._id });

    // Success Response for Path B
    return res.status(200).json({
      status: 'success',
      message: 'Payment added successfully'
    });
  }
});


// exports.addPayment = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const { amount, paymentMethod, referenceNumber, transactionId, notes } = req.body;

//   if (!amount || amount <= 0) {
//     return next(new AppError('Payment amount must be positive', 400));
//   }

//   await runInTransaction(async (session) => {
//     const invoice = await Invoice.findOne({
//       _id: id,
//       organizationId: req.user.organizationId
//     }).session(session);

//     if (!invoice) throw new AppError('Invoice not found', 404);
//     if (invoice.status === 'cancelled') throw new AppError('Cannot add payment to cancelled invoice', 400);
//     if (invoice.status === 'paid') throw new AppError('Invoice already fully paid', 400);

//     const newPaidAmount = invoice.paidAmount + amount;
//     const newBalance = invoice.grandTotal - newPaidAmount;

//     if (newPaidAmount > invoice.grandTotal) {
//       throw new AppError(
//         `Payment exceeds invoice total. Maximum allowed: ${invoice.grandTotal - invoice.paidAmount}`,
//         400
//       );
//     }

//     // Store old values for audit
//     const oldValues = {
//       paidAmount: invoice.paidAmount,
//       balanceAmount: invoice.balanceAmount,
//       paymentStatus: invoice.paymentStatus,
//       status: invoice.status
//     };

//     // --- PROCESS PAYMENT LOGIC (INLINED) ---
    
//     // 1. Create Payment Record
//     const payment = (await Payment.create([{
//         organizationId: req.user.organizationId,
//         branchId: invoice.branchId, // Use invoice branch
//         type: 'inflow',
//         customerId: invoice.customerId,
//         invoiceId: invoice._id,
//         paymentDate: new Date(),
//         amount: amount,
//         paymentMethod: paymentMethod || invoice.paymentMethod || 'cash',
//         transactionMode: 'manual', // Manual entry via API
//         referenceNumber: referenceNumber,
//         transactionId: transactionId,
//         remarks: notes || `Payment for Invoice #${invoice.invoiceNumber}`,
//         status: 'completed',
//         allocationStatus: 'fully_allocated',
//         remainingAmount: 0,
//         allocatedTo: [{
//             type: 'invoice',
//             documentId: invoice._id,
//             amount: amount,
//             allocatedAt: new Date()
//         }],
//         createdBy: req.user._id
//     }], { session }))[0];

//     // 2. Create Accounting Entries
//     // Helper to get/init account (Simplified for this context)
//     const getOrInitAccount = async (orgId, type, name, code) => {
//         let account = await Account.findOne({ organizationId: orgId, code }).session(session);
//         if (!account) {
//              account = (await Account.create([{
//                 organizationId: orgId, name, code, type, isGroup: false, cachedBalance: 0
//             }], { session }))[0];
//         }
//         return account;
//     };

//     let accountName = 'Cash';
//     let accountCode = '1001';
//     const method = paymentMethod || invoice.paymentMethod || 'cash';
    
//     switch (method) {
//         case 'bank': case 'cheque': accountName = 'Bank'; accountCode = '1002'; break;
//         case 'upi': accountName = 'UPI Receivables'; accountCode = '1003'; break;
//         case 'card': accountName = 'Card Receivables'; accountCode = '1004'; break;
//     }

//     const [assetAccount, arAccount] = await Promise.all([
//         getOrInitAccount(req.user.organizationId, 'asset', accountName, accountCode),
//         getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200')
//     ]);

//     // Dr Asset
//     await AccountEntry.create([{
//         organizationId: req.user.organizationId,
//         branchId: invoice.branchId,
//         accountId: assetAccount._id,
//         date: new Date(),
//         debit: amount,
//         credit: 0,
//         description: `Payment for ${invoice.invoiceNumber}`,
//         referenceType: 'payment',
//         referenceId: invoice._id,
//         paymentId: payment._id,
//         createdBy: req.user._id
//     }], { session });

//     // Cr AR
//     await AccountEntry.create([{
//         organizationId: req.user.organizationId,
//         branchId: invoice.branchId,
//         accountId: arAccount._id,
//         customerId: invoice.customerId,
//         date: new Date(),
//         debit: 0,
//         credit: amount,
//         description: `Payment applied to ${invoice.invoiceNumber}`,
//         referenceType: 'payment',
//         referenceId: invoice._id,
//         paymentId: payment._id,
//         createdBy: req.user._id
//     }], { session });

//     // 3. Update Customer Balance
//     await Customer.findByIdAndUpdate(
//         invoice.customerId,
//         { $inc: { outstandingBalance: -amount } },
//         { session }
//     );

//     // --- END PAYMENT LOGIC ---

//     // Update invoice
//     invoice.paidAmount = newPaidAmount;
//     invoice.balanceAmount = newBalance;
    
//     // Update payment status and overall status
//     if (newBalance <= 0) {
//       invoice.paymentStatus = 'paid';
//       invoice.status = 'paid';
//     } else {
//       invoice.paymentStatus = 'partial';
//     }

//     if (paymentMethod) invoice.paymentMethod = paymentMethod;
//     if (notes) invoice.notes = (invoice.notes || '') + `\nPayment: ${notes}`;

//     await invoice.save({ session });

//     // CREATE AUDIT LOG
//     await InvoiceAudit.create([{
//       invoiceId: invoice._id,
//       action: 'PAYMENT_ADDED',
//       performedBy: req.user._id,
//       details: `Payment of ${amount} added via ${paymentMethod}. New paid: ${newPaidAmount}/${invoice.grandTotal}`,
//       oldValues,
//       newValues: {
//         paidAmount: invoice.paidAmount,
//         balanceAmount: invoice.balanceAmount,
//         paymentStatus: invoice.paymentStatus,
//         status: invoice.status
//       },
//       ipAddress: req.ip
//     }], { session });

//   }, 3, { action: "ADD_PAYMENT", userId: req.user._id });

//   res.status(200).json({
//     status: 'success',
//     message: 'Payment added successfully'
//   });
// });
