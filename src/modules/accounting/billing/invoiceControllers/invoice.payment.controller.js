// const mongoose = require("mongoose");
// const { z } = require("zod");
// const { format } = require('fast-csv');
// const Invoice = require("../invoice.model");
// const { invalidateOpeningBalance } = require("../../core/ledgerCache.service");
// const ProfitCalculator = require('../utils/profitCalculator');

// const Payment = require("../../payments/payment.model");
// const Product = require("../../../inventory/core/model/product.model");
// const Customer = require("../../../organization/core/customer.model");
// const AccountEntry = require('../../core/accountEntry.model');
// const Account = require('../../core/account.model');
// const Organization = require("../../../organization/core/organization.model");
// const InvoiceAudit = require('../invoiceAudit.model');

// const catchAsync = require("../../../../core/utils/api/catchAsync");
// const AppError = require("../../../../core/utils/api/appError");
// const factory = require("../../../../core/utils/api/handlerFactory");
// const { runInTransaction } = require("../../../../core/utils/db/runInTransaction");
// const { emitToOrg } = require("../../../../socketHandlers/socket");
// const automationService = require('../../../webhook/automationService');
// const EMI = require('../../payments/emi.model'); // Adjust path to your EMI model
// const emiService = require('../../payments/emiService'); // Adjust path to your Service

// // /* ======================================================
// //    5. GET INVOICE PAYMENTS
// // ====================================================== */
// exports.getInvoicePayments = catchAsync(async (req, res, next) => {
//   const payments = await Payment.find({
//     invoiceId: req.params.id,
//     organizationId: req.user.organizationId,
//     isDeleted: { $ne: true }
//   })
//     .sort({ paymentDate: -1 })
//     .populate('createdBy', 'name email');

//   res.status(200).json({
//     status: 'success',
//     results: payments.length,
//     data: { payments }
//   });
// });
// /* ======================================================
//    4. ADD PAYMENT TO INVOICE (MUTUALLY EXCLUSIVE LOGIC)
// ====================================================== */
// exports.addPayment = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   let { amount, paymentMethod, referenceNumber, transactionId, notes } = req.body; // Change const to let
//   amount = Number(amount);
//   if (!amount || amount <= 0 || isNaN(amount)) {
//     return next(new AppError('Payment amount must be a positive number', 400));
//   }
//   const existingEmi = await EMI.findOne({
//     invoiceId: id,
//     status: { $ne: 'cancelled' }
//   });

//   // ============================================================
//   // PATH A: EMI EXISTS (Run THIS or PATH B, never both)
//   // ============================================================
//   if (existingEmi) {
//     // This service handles EVERYTHING (Payment, Ledger, Invoice Update)
//     await emiService.reconcileExternalPayment({
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId,
//       invoiceId: id,
//       amount: Number(amount),
//       paymentMethod: paymentMethod || 'cash',
//       referenceNumber: referenceNumber,
//       transactionId: transactionId,
//       remarks: notes || 'Payment added via Invoice Screen',
//       createdBy: req.user._id
//     });

//     // 🛑 RETURN IMMEDIATELY so Path B doesn't run
//     return res.status(200).json({
//       status: 'success',
//       message: 'Payment recorded and synced with EMI Plan'
//     });
//   }

//   // ============================================================
//   // PATH B: NO EMI (Standard Invoice Logic)
//   // ============================================================
//   else {
//     await runInTransaction(async (session) => {
//       const invoice = await Invoice.findOne({
//         _id: id,
//         organizationId: req.user.organizationId
//       }).session(session);

//       if (!invoice) throw new AppError('Invoice not found', 404);
//       if (invoice.status === 'cancelled') throw new AppError('Cannot add payment to cancelled invoice', 400);
//       if (invoice.status === 'paid') throw new AppError('Invoice already fully paid', 400);

//       const newPaidAmount = invoice.paidAmount + amount;

//       // Validation to prevent overpayment
//       if (newPaidAmount > invoice.grandTotal) {
//         throw new AppError(
//           `Payment exceeds invoice total. Maximum allowed: ${invoice.grandTotal - invoice.paidAmount}`,
//           400
//         );
//       }

//       // 1. Create Payment Record
//       const [payment] = await Payment.create([{
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
//           type: 'invoice',
//           documentId: invoice._id,
//           amount: amount,
//           allocatedAt: new Date()
//         }],
//         createdBy: req.user._id
//       }], { session });

//       // 2. Create Accounting Entries (Ledger)
//       await createPaymentAccountingEntries({
//         invoice,
//         payment,
//         userId: req.user._id,
//         session
//       });

//       // 3. Update Customer Balance
//       await Customer.findByIdAndUpdate(
//         invoice.customerId,
//         { $inc: { outstandingBalance: -amount } },
//         { session }
//       );

//       // 4. Update Invoice Status
//       invoice.paidAmount = newPaidAmount;
//       invoice.balanceAmount = invoice.grandTotal - newPaidAmount;

//       if (invoice.balanceAmount <= 0) {
//         invoice.paymentStatus = 'paid';
//         invoice.status = 'paid';
//       } else {
//         invoice.paymentStatus = 'partial';
//       }

//       if (paymentMethod) invoice.paymentMethod = paymentMethod;
//       if (notes) invoice.notes = (invoice.notes || '') + `\nPayment: ${notes}`;

//       await invoice.save({ session });

//       // 5. Audit Log
//       await InvoiceAudit.create([{
//         invoiceId: invoice._id,
//         action: 'PAYMENT_ADDED',
//         performedBy: req.user._id,
//         details: `Payment of ${amount} added. New paid: ${newPaidAmount}`,
//         ipAddress: req.ip
//       }], { session });

//     }, 3, { action: "ADD_PAYMENT", userId: req.user._id });

//     // Success Response for Path B
//     return res.status(200).json({
//       status: 'success',
//       message: 'Payment added successfully'
//     });
//   }
// });

