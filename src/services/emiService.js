// const mongoose = require('mongoose');
// const AppError = require('../utils/appError');

// const EMI = require('../models/emiModel');
// const Invoice = require('../models/invoiceModel');
// const Customer = require('../models/customerModel');
// const Payment = require('../models/paymentModel');
// const Account = require('../models/accountModel');
// const AccountEntry = require('../models/accountEntryModel');

// /* ======================================================
//    INTERNAL: APPLY EMI ACCOUNTING (SINGLE SOURCE)
// ====================================================== */
// async function applyEmiAccounting({
//   organizationId,
//   branchId,
//   amount,
//   paymentId,
//   customerId,
//   invoiceId,
//   paymentMethod,
//   referenceNumber,
//   createdBy
// }, session) {

//   const bankAccount = await Account.findOne({
//     organizationId,
//     code: paymentMethod === 'cash' ? '1001' : '1002'
//   }).session(session);

//   const arAccount = await Account.findOne({
//     organizationId,
//     code: '1200'
//   }).session(session);

//   if (!bankAccount || !arAccount) {
//     throw new AppError('Missing Cash/Bank or AR account', 500);
//   }

//   const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
//   if (!invoice) throw new AppError('Invoice not found', 404);

//   invoice.paidAmount += amount;
//   invoice.balanceAmount = Math.round((invoice.grandTotal - invoice.paidAmount) * 100) / 100;
//   invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
//   await invoice.save({ session });

//   await Customer.findOneAndUpdate(
//     { _id: customerId, organizationId },
//     { $inc: { outstandingBalance: -amount } },
//     { session }
//   );

//   await AccountEntry.create([
//     {
//       organizationId,
//       branchId,
//       accountId: bankAccount._id,
//       paymentId,
//       debit: amount,
//       credit: 0,
//       description: `EMI Payment`,
//       referenceType: 'emi_payment',
//       referenceId: paymentId,
//       createdBy
//     },
//     {
//       organizationId,
//       branchId,
//       accountId: arAccount._id,
//       customerId,
//       paymentId,
//       debit: 0,
//       credit: amount,
//       description: `EMI Payment`,
//       referenceType: 'emi_payment',
//       referenceId: paymentId,
//       createdBy
//     }
//   ], { session });
// }

// exports.createEmiPlan = async ({
//   organizationId,
//   branchId,
//   invoiceId,
//   createdBy,
//   downPayment = 0,
//   numberOfInstallments,
//   interestRate = 0,
//   emiStartDate
// }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // 1️⃣ Fetch invoice
//     const invoice = await Invoice.findOne({
//       _id: invoiceId,
//       organizationId
//     }).session(session);

//     if (!invoice) {
//       throw new AppError('Invoice not found', 404);
//     }

//     // 2️⃣ Prevent duplicate EMI
//     const existing = await EMI.findOne({ invoiceId }).session(session);
//     if (existing) {
//       throw new AppError('EMI already exists for this invoice', 400);
//     }

//     // 3️⃣ Handle DOWN PAYMENT (Accounting + Invoice + Customer)
//     if (downPayment > 0) {
//       const cashAccount = await Account.findOne({
//         organizationId,
//         code: '1001'
//       }).session(session);

//       const arAccount = await Account.findOne({
//         organizationId,
//         code: '1200'
//       }).session(session);

//       if (!cashAccount || !arAccount) {
//         throw new AppError('Missing Cash or Accounts Receivable account', 500);
//       }

//       await AccountEntry.create(
//         [
//           {
//             organizationId,
//             branchId,
//             accountId: cashAccount._id,
//             debit: downPayment,
//             credit: 0,
//             description: 'EMI Down Payment',
//             referenceType: 'emi_down_payment',
//             referenceId: invoiceId,
//             createdBy
//           },
//           {
//             organizationId,
//             branchId,
//             accountId: arAccount._id,
//             debit: 0,
//             credit: downPayment,
//             description: 'EMI Down Payment',
//             referenceType: 'emi_down_payment',
//             referenceId: invoiceId,
//             createdBy
//           }
//         ],
//         { session }
//       );

//       invoice.paidAmount += downPayment;
//       invoice.balanceAmount = Math.round(
//         (invoice.grandTotal - invoice.paidAmount) * 100
//       ) / 100;
//       invoice.paymentStatus =
//         invoice.balanceAmount <= 0 ? 'paid' : 'partial';

//       await invoice.save({ session });

//       await Customer.findByIdAndUpdate(
//         invoice.customerId,
//         { $inc: { outstandingBalance: -downPayment } },
//         { session }
//       );
//     }

//     // 4️⃣ Calculate EMI values
//     const balanceAmount = invoice.balanceAmount;
//     const principalPerInstallment = Math.round(
//       (balanceAmount / numberOfInstallments) * 100
//     ) / 100;

//     // 5️⃣ Generate INSTALLMENTS (FIXED)
//     const installments = Array.from({ length: numberOfInstallments }).map(
//       (_, i) => {
//         const dueDate = new Date(emiStartDate);
//         dueDate.setMonth(dueDate.getMonth() + i);

//         return {
//           installmentNumber: i + 1,
//           dueDate,
//           principalAmount: principalPerInstallment, // ✅ REQUIRED
//           interestAmount: 0,                        // (extend later)
//           totalAmount: principalPerInstallment,     // ✅ REQUIRED
//           paidAmount: 0,
//           paymentStatus: 'pending'                  // ✅ VALID ENUM
//         };
//       }
//     );

//     // 6️⃣ Calculate EMI END DATE
//     const emiEndDate = new Date(emiStartDate);
//     emiEndDate.setMonth(
//       emiEndDate.getMonth() + numberOfInstallments - 1
//     );

//     // 7️⃣ Create EMI document
//     const [emi] = await EMI.create(
//       [
//         {
//           organizationId,
//           branchId,
//           invoiceId,
//           customerId: invoice.customerId,
//           totalAmount: invoice.grandTotal,
//           downPayment,
//           balanceAmount,
//           numberOfInstallments,
//           interestRate,
//           emiStartDate,
//           emiEndDate,
//           installments,
//           createdBy
//         }
//       ],
//       { session }
//     );

//     // 8️⃣ Commit
//     await session.commitTransaction();
//     return emi;

//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// };

// exports.payEmiInstallment = async ({
//   emiId,
//   installmentNumber,
//   amount,
//   paymentMethod,
//   referenceNumber,
//   remarks,
//   organizationId,
//   branchId,
//   createdBy
// }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const emi = await EMI.findOne({ _id: emiId, organizationId }).session(session);
//     if (!emi) throw new AppError('EMI not found', 404);

//     const inst = emi.installments.find(i => i.installmentNumber === Number(installmentNumber));
//     if (!inst) throw new AppError('Invalid installment', 400);
//     if (inst.paymentStatus === 'paid') {
//       throw new AppError('Installment already paid', 400);
//     }

//     const [payment] = await Payment.create([{
//       organizationId,
//       branchId,
//       type: 'inflow',
//       customerId: emi.customerId,
//       invoiceId: emi.invoiceId,
//       amount,
//       paymentMethod,
//       referenceNumber,
//       remarks,
//       status: 'completed',
//       transactionMode: 'auto',
//       createdBy
//     }], { session });

//     inst.paidAmount += amount;
//     inst.paymentStatus = inst.paidAmount >= inst.totalAmount ? 'paid' : 'partial';
//     inst.paymentId = payment._id;

//     if (emi.installments.every(i => i.paymentStatus === 'paid')) {
//       emi.status = 'completed';
//     }

//     await emi.save({ session });

//     await applyEmiAccounting({
//       organizationId,
//       branchId,
//       amount,
//       paymentId: payment._id,
//       customerId: emi.customerId,
//       invoiceId: emi.invoiceId,
//       paymentMethod,
//       referenceNumber,
//       createdBy
//     }, session);

//     await session.commitTransaction();
//     return { emi, payment };

//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// };

// exports.getEmiById = async (emiId, organizationId) => {
//   return EMI.findOne({
//     _id: emiId,
//     organizationId
//   })
//     .populate('customerId', 'name phone email avatar')
//     .populate('invoiceId', 'invoiceNumber grandTotal paidAmount balanceAmount paymentStatus')
//     .populate('createdBy', 'name email')
//     .lean();
// };

// exports.getEmiByInvoice = async (invoiceId, organizationId) => {
//   return EMI.findOne({
//     invoiceId,
//     organizationId
//   })
//     .populate('customerId', 'name phone email avatar')
//     .populate('invoiceId', 'invoiceNumber grandTotal paidAmount balanceAmount paymentStatus')
//     .populate('createdBy', 'name email')
//     .lean();
// };

// /* ======================================================
//    LIST EMIs (FILTERABLE)
// ====================================================== */
// exports.getEmis = async ({
//   organizationId,
//   branchId,
//   customerId,
//   status
// }) => {
//   const filter = { organizationId };

//   if (branchId) filter.branchId = branchId;
//   if (customerId) filter.customerId = customerId;
//   if (status) filter.status = status;

//   return EMI.find(filter)
//     .sort({ createdAt: -1 })
//     .populate('customerId', 'name phone')
//     .populate('invoiceId', 'invoiceNumber grandTotal')
//     .lean();
// };

// /* ======================================================
//    EMI SUMMARY (DASHBOARD)
// ====================================================== */
// exports.getEmiSummary = async (organizationId) => {
//   const summary = await EMI.aggregate([
//     { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
//     {
//       $group: {
//         _id: '$status',
//         count: { $sum: 1 },
//         totalBalance: { $sum: '$balanceAmount' }
//       }
//     }
//   ]);

//   return summary;
// };
// /* ======================================================
//    MARK OVERDUE EMIs AS DEFAULTED
// ====================================================== */
// exports.markDefaultedEmis = async () => {
//   const today = new Date();

//   return EMI.updateMany(
//     {
//       status: 'active',
//       installments: {
//         $elemMatch: {
//           dueDate: { $lt: today },
//           paymentStatus: { $ne: 'paid' }
//         }
//       }
//     },
//     { $set: { status: 'defaulted' } }
//   );
// };

// exports.markOverdueInstallments = async () => {
//   const today = new Date();

//   const emis = await EMI.find({
//     status: 'active',
//     'installments.paymentStatus': { $in: ['pending', 'partial'] }
//   });

//   for (const emi of emis) {
//     let updated = false;

//     emi.installments.forEach(inst => {
//       if (
//         inst.paymentStatus !== 'paid' &&
//         inst.dueDate < today
//       ) {
//         inst.paymentStatus = 'overdue';
//         updated = true;
//       }
//     });

//     if (updated) {
//       await emi.save();
//     }
//   }

//   return { updatedEmis: emis.length };
// };

// exports.getEmiAnalytics = async (organizationId) => {
//   const emis = await EMI.find({ organizationId });

//   let stats = {
//     totalEmis: emis.length,
//     active: 0,
//     completed: 0,
//     defaulted: 0,
//     totalOutstanding: 0,
//     installments: {
//       pending: 0,
//       paid: 0,
//       partial: 0,
//       overdue: 0
//     }
//   };

//   for (const emi of emis) {
//     stats[emi.status]++;

//     stats.totalOutstanding += emi.balanceAmount;

//     emi.installments.forEach(inst => {
//       stats.installments[inst.paymentStatus]++;
//     });
//   }

//   return stats;
// };

// exports.getEmiLedgerReconciliation = async ({
//   organizationId,
//   fromDate,
//   toDate
// }) => {
//   const match = {
//     organizationId,
//     referenceType: 'emi_payment'
//   };

//   if (fromDate && toDate) {
//     match.createdAt = {
//       $gte: new Date(fromDate),
//       $lte: new Date(toDate)
//     };
//   }

//   const entries = await AccountEntry.find(match)
//     .populate('accountId', 'name code')
//     .populate('paymentId', 'amount paymentMethod')
//     .sort({ createdAt: -1 });

//   return entries;
// };
const mongoose = require('mongoose');
const AppError = require('../utils/appError');

const EMI = require('../models/emiModel');
const Invoice = require('../models/invoiceModel');
const Customer = require('../models/customerModel');
const Payment = require('../models/paymentModel');
const Account = require('../models/accountModel');
const AccountEntry = require('../models/accountEntryModel');

/* ======================================================
   INTERNAL: APPLY EMI ACCOUNTING
====================================================== */
async function applyEmiAccounting({
  organizationId,
  branchId,
  amount,
  paymentId,
  customerId,
  invoiceId,
  paymentMethod,
  referenceNumber,
  createdBy
}, session) {

  const bankAccount = await Account.findOne({
    organizationId,
    code: paymentMethod === 'cash' ? '1001' : '1002'
  }).session(session);

  const arAccount = await Account.findOne({
    organizationId,
    code: '1200'
  }).session(session);

  if (!bankAccount || !arAccount) {
    throw new AppError('Missing Cash/Bank or AR account', 500);
  }

  const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
  if (!invoice) throw new AppError('Invoice not found', 404);

  // Update invoice amounts
  invoice.paidAmount += amount;
  invoice.balanceAmount = Math.round((invoice.grandTotal - invoice.paidAmount) * 100) / 100;
  invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
  await invoice.save({ session });

  // Update customer outstanding
  await Customer.findOneAndUpdate(
    { _id: customerId, organizationId },
    { $inc: { outstandingBalance: -amount } },
    { session }
  );

  // Create ledger entries
  await AccountEntry.insertMany([
    {
      organizationId,
      branchId,
      accountId: bankAccount._id,
      paymentId,
      debit: amount,
      credit: 0,
      description: `EMI Payment`,
      referenceType: 'emi_payment',
      referenceId: paymentId,
      createdBy
    },
    {
      organizationId,
      branchId,
      accountId: arAccount._id,
      customerId,
      paymentId,
      debit: 0,
      credit: amount,
      description: `EMI Payment`,
      referenceType: 'emi_payment',
      referenceId: paymentId,
      createdBy
    }
  ], { session, ordered: true });
}

/* ======================================================
   CREATE EMI PLAN (WITH DOWN PAYMENT ACCOUNTING)
====================================================== */
exports.createEmiPlan = async ({
  organizationId,
  branchId,
  invoiceId,
  createdBy,
  downPayment = 0,
  numberOfInstallments,
  interestRate = 0,
  emiStartDate
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
    if (!invoice) throw new AppError('Invoice not found', 404);

    const existing = await EMI.findOne({ invoiceId }).session(session);
    if (existing) throw new AppError('EMI already exists for this invoice', 400);

    // Down payment accounting
    if (downPayment > 0) {
      const cashAccount = await Account.findOne({ organizationId, code: '1001' }).session(session);
      const arAccount = await Account.findOne({ organizationId, code: '1200' }).session(session);
      if (!cashAccount || !arAccount) throw new AppError('Missing Cash or AR account', 500);

      await AccountEntry.insertMany([
        {
          organizationId,
          branchId,
          accountId: cashAccount._id,
          debit: downPayment,
          credit: 0,
          description: 'EMI Down Payment',
          referenceType: 'emi_down_payment',
          referenceId: invoiceId,
          createdBy
        },
        {
          organizationId,
          branchId,
          accountId: arAccount._id,
          debit: 0,
          credit: downPayment,
          description: 'EMI Down Payment',
          referenceType: 'emi_down_payment',
          referenceId: invoiceId,
          createdBy
        }
      ], { session, ordered: true });

      invoice.paidAmount += downPayment;
      invoice.balanceAmount = Math.round((invoice.grandTotal - invoice.paidAmount) * 100) / 100;
      invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
      await invoice.save({ session });

      await Customer.findByIdAndUpdate(invoice.customerId, { $inc: { outstandingBalance: -downPayment } }, { session });
    }

    // EMI calculation
    const balanceAmount = invoice.balanceAmount;
    const principalPerInstallment = Math.round((balanceAmount / numberOfInstallments) * 100) / 100;

    const installments = Array.from({ length: numberOfInstallments }).map((_, i) => {
      const dueDate = new Date(emiStartDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      return {
        installmentNumber: i + 1,
        dueDate,
        principalAmount: principalPerInstallment,
        interestAmount: 0,
        totalAmount: principalPerInstallment,
        paidAmount: 0,
        paymentStatus: 'pending'
      };
    });

    const emiEndDate = new Date(emiStartDate);
    emiEndDate.setMonth(emiEndDate.getMonth() + numberOfInstallments - 1);

    const [emi] = await EMI.create([{
      organizationId,
      branchId,
      invoiceId,
      customerId: invoice.customerId,
      totalAmount: invoice.grandTotal,
      downPayment,
      balanceAmount,
      numberOfInstallments,
      interestRate,
      emiStartDate,
      emiEndDate,
      installments,
      createdBy
    }], { session });

    await session.commitTransaction();
    return emi;

  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/* ======================================================
   PAY EMI INSTALLMENT
====================================================== */
// exports.payEmiInstallment = async ({
//   emiId,
//   installmentNumber,
//   amount,
//   paymentMethod,
//   referenceNumber,
//   remarks,
//   organizationId,
//   branchId,
//   createdBy
// }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const emi = await EMI.findOne({ _id: emiId, organizationId }).session(session);
//     if (!emi) throw new AppError('EMI not found', 404);

//     const inst = emi.installments.find(i => i.installmentNumber === Number(installmentNumber));
//     if (!inst) throw new AppError('Invalid installment', 400);
//     if (inst.paymentStatus === 'paid') throw new AppError('Installment already paid', 400);

//     const payment = await Payment.create({
//       organizationId,
//       branchId,
//       type: 'inflow',
//       customerId: emi.customerId,
//       invoiceId: emi.invoiceId,
//       amount,
//       paymentMethod,
//       referenceNumber,
//       remarks,
//       status: 'completed',
//       transactionMode: 'auto',
//       createdBy
//     }, { session });

//     inst.paidAmount += amount;
//     inst.paymentStatus = inst.paidAmount >= inst.totalAmount ? 'paid' : 'partial';
//     inst.paymentId = payment._id;

//     if (emi.installments.every(i => i.paymentStatus === 'paid')) emi.status = 'completed';
//     await emi.save({ session });

//     await applyEmiAccounting({
//       organizationId,
//       branchId,
//       amount,
//       paymentId: payment._id,
//       customerId: emi.customerId,
//       invoiceId: emi.invoiceId,
//       paymentMethod,
//       referenceNumber,
//       createdBy
//     }, session);

//     await session.commitTransaction();
//     return { emi, payment };

//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// };
exports.payEmiInstallment = async ({
  emiId,
  installmentNumber,
  amount,
  paymentMethod,
  referenceNumber,
  remarks,
  organizationId,
  branchId,
  createdBy
}) => {

  // 🔐 HARD VALIDATION (prevents silent failures)
  if (!organizationId) throw new AppError('organizationId missing', 500);
  if (!emiId) throw new AppError('emiId required', 400);
  if (!installmentNumber) throw new AppError('installmentNumber required', 400);
  if (!amount || amount <= 0) throw new AppError('Amount must be > 0', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const emi = await EMI.findOne({
      _id: emiId,
      organizationId
    }).session(session);

    if (!emi) throw new AppError('EMI not found', 404);

    const installment = emi.installments.find(
      i => i.installmentNumber === Number(installmentNumber)
    );

    if (!installment) throw new AppError('Invalid installment', 400);
    if (installment.paymentStatus === 'paid') {
      throw new AppError('Installment already paid', 400);
    }

    /* ----------------------------------------
       CREATE PAYMENT (SCHEMA-ALIGNED)
    ---------------------------------------- */
    const [payment] = await Payment.create(
      [
        {
          organizationId,
          branchId,
          type: 'inflow',                // ✅ REQUIRED
          customerId: emi.customerId,
          invoiceId: emi.invoiceId,
          amount: Number(amount),        // ✅ REQUIRED
          paymentMethod,
          referenceNumber,
          remarks,
          transactionMode: 'auto',
          status: 'completed',
          createdBy
        }
      ],
      { session, ordered: true }
    );

    /* ----------------------------------------
       UPDATE INSTALLMENT
    ---------------------------------------- */
    installment.paidAmount += Number(amount);

    installment.paymentStatus =
      installment.paidAmount >= installment.totalAmount
        ? 'paid'
        : 'partial';

    installment.paymentId = payment._id;

    /* ----------------------------------------
       UPDATE EMI STATUS
    ---------------------------------------- */
    if (emi.installments.every(i => i.paymentStatus === 'paid')) {
      emi.status = 'completed';
    }

    await emi.save({ session });

    /* ----------------------------------------
       ACCOUNTING ENTRIES
    ---------------------------------------- */
    await applyEmiAccounting({
      organizationId,
      branchId,
      amount: Number(amount),
      paymentId: payment._id,
      customerId: emi.customerId,
      invoiceId: emi.invoiceId,
      paymentMethod,
      referenceNumber,
      createdBy
    }, session);

    await session.commitTransaction();

    return { emi, payment };

  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/* ======================================================
   FETCH EMI
====================================================== */
exports.getEmiById = async (emiId, organizationId) => {
  return EMI.findOne({ _id: emiId, organizationId })
    .populate('customerId', 'name phone email avatar')
    .populate('invoiceId', 'invoiceNumber grandTotal paidAmount balanceAmount paymentStatus')
    .populate('createdBy', 'name email')
    .lean();
};

exports.getEmiByInvoice = async (invoiceId, organizationId) => {
  return EMI.findOne({ invoiceId, organizationId })
    .populate('customerId', 'name phone email avatar')
    .populate('invoiceId', 'invoiceNumber grandTotal paidAmount balanceAmount paymentStatus')
    .populate('createdBy', 'name email')
    .lean();
};

/* ======================================================
   LIST & FILTER EMIs
====================================================== */
exports.getEmis = async ({ organizationId, branchId, customerId, status }) => {
  const filter = { organizationId };
  if (branchId) filter.branchId = branchId;
  if (customerId) filter.customerId = customerId;
  if (status) filter.status = status;

  return EMI.find(filter)
    .sort({ createdAt: -1 })
    .populate('customerId', 'name phone')
    .populate('invoiceId', 'invoiceNumber grandTotal')
    .lean();
};

/* ======================================================
   EMI DASHBOARD ANALYTICS
====================================================== */
exports.getEmiSummary = async (organizationId) => {
  return EMI.aggregate([
    { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
    { $group: { _id: '$status', count: { $sum: 1 }, totalBalance: { $sum: '$balanceAmount' } } }
  ]);
};

exports.getEmiAnalytics = async (organizationId) => {
  const emis = await EMI.find({ organizationId });
  const stats = {
    totalEmis: emis.length,
    active: 0,
    completed: 0,
    defaulted: 0,
    totalOutstanding: 0,
    installments: { pending: 0, paid: 0, partial: 0, overdue: 0 }
  };

  for (const emi of emis) {
    stats[emi.status]++;
    stats.totalOutstanding += emi.balanceAmount;
    emi.installments.forEach(i => stats.installments[i.paymentStatus]++);
  }

  return stats;
};

/* ======================================================
   MARK OVERDUE & DEFAULTED EMIs
====================================================== */
exports.markOverdueInstallments = async () => {
  const today = new Date();
  const emis = await EMI.find({ status: 'active', 'installments.paymentStatus': { $in: ['pending', 'partial'] } });

  for (const emi of emis) {
    let updated = false;
    emi.installments.forEach(inst => {
      if (inst.paymentStatus !== 'paid' && inst.dueDate < today) {
        inst.paymentStatus = 'overdue';
        updated = true;
      }
    });
    if (updated) await emi.save();
  }

  return { updatedEmis: emis.length };
};

exports.markDefaultedEmis = async () => {
  const today = new Date();
  return EMI.updateMany(
    {
      status: 'active',
      installments: { $elemMatch: { dueDate: { $lt: today }, paymentStatus: { $ne: 'paid' } } }
    },
    { $set: { status: 'defaulted' } }
  );
};

/* ======================================================
   EMI LEDGER RECONCILIATION
====================================================== */
exports.getEmiLedgerReconciliation = async ({ organizationId, fromDate, toDate }) => {
  const match = { organizationId, referenceType: 'emi_payment' };
  if (fromDate && toDate) match.createdAt = { $gte: new Date(fromDate), $lte: new Date(toDate) };

  return AccountEntry.find(match)
    .populate('accountId', 'name code')
    .populate('paymentId', 'amount paymentMethod')
    .sort({ createdAt: -1 });
};

// ✅ Refactoring Notes / Fixes

// insertMany([...], { session, ordered: true }) used for multiple documents.

// Payment.create(doc, { session }) used for single doc to avoid session errors.

// installments now always have principalAmount, totalAmount, and paymentStatus fields.

// Transactions (session) ensure atomicity: any failure rolls back.

// Overdue and defaulted EMIs handled separately (markOverdueInstallments, markDefaultedEmis).


// const mongoose = require('mongoose');
// const AppError = require('../utils/appError');

// // Models
// const EMI = require('../models/emiModel');
// const Invoice = require('../models/invoiceModel');
// const Customer = require('../models/customerModel');
// const Payment = require('../models/paymentModel');
// const Account = require('../models/accountModel');
// const AccountEntry = require('../models/accountEntryModel');

// /* ==========================================================================
//    INTERNAL HELPER: Accounting Logic for EMI Payments
//    (Replicates paymentController logic to avoid circular dependencies)
// ========================================================================== */
// async function applyEmiAccounting(params, session) {
//   const { 
//     organizationId, branchId, amount, paymentId, 
//     customerId, invoiceId, paymentMethod, referenceNumber, createdBy 
//   } = params;

//   // 1. Resolve Accounts
//   const isCash = paymentMethod === 'cash';
//   const bankQuery = isCash 
//     ? { $or: [{ code: '1001' }, { name: 'Cash' }] }
//     : { $or: [{ code: '1002' }, { name: 'Bank' }] };
    
//   const bankAccount = await Account.findOne({ organizationId, ...bankQuery }).session(session);
//   const arAccount = await Account.findOne({ 
//     organizationId, 
//     $or: [{ code: '1200' }, { name: 'Accounts Receivable' }] 
//   }).session(session);

//   if (!bankAccount || !arAccount) {
//     throw new AppError('Critical: Default ledger accounts (Cash/Bank or AR) missing.', 500);
//   }

//   // 2. Update Invoice Balance (The EMI payment pays down the invoice)
//   const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
//   if (invoice) {
//     invoice.paidAmount = (invoice.paidAmount || 0) + amount;
//     invoice.balanceAmount = invoice.grandTotal - invoice.paidAmount;
//     invoice.balanceAmount = Math.round(invoice.balanceAmount * 100) / 100;
    
//     if (invoice.balanceAmount <= 0) invoice.paymentStatus = 'paid';
//     else invoice.paymentStatus = 'partial';
    
//     await invoice.save({ session });
//   }

//   // 3. Update Customer Outstanding
//   await Customer.findOneAndUpdate(
//     { _id: customerId, organizationId },
//     { $inc: { outstandingBalance: -amount } },
//     { session }
//   );

//   // 4. Create Ledger Entries (Dr Bank, Cr AR)
//   const entryDate = new Date();
  
//   // Debit Bank/Cash
//   await AccountEntry.create([{
//     organizationId, branchId,
//     accountId: bankAccount._id,
//     paymentId,
//     date: entryDate,
//     debit: amount, credit: 0,
//     description: `EMI Payment: ${referenceNumber || 'Cash'}`,
//     referenceType: 'payment', referenceId: paymentId, createdBy
//   }], { session });

//   // Credit AR
//   await AccountEntry.create([{
//     organizationId, branchId,
//     accountId: arAccount._id,
//     customerId, 
//     paymentId,
//     date: entryDate,
//     debit: 0, credit: amount,
//     description: `EMI Payment: ${referenceNumber || 'Cash'}`,
//     referenceType: 'payment', referenceId: paymentId, createdBy
//   }], { session });
// }

// /* ==========================================================================
//    CORE SERVICES
// ========================================================================== */

// /**
//  * Pay a specific EMI Installment
//  * 🛑 CRITICAL: This now updates Invoice, Customer, and Ledger.
//  */
// exports.payEmiInstallment = async ({ 
//   emiId, installmentNumber, amount, paymentMethod, 
//   referenceNumber, remarks, organizationId, branchId, createdBy 
// }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // 1. Fetch EMI
//     const emi = await EMI.findOne({ _id: emiId, organizationId }).session(session);
//     if (!emi) throw new AppError('EMI plan not found', 404);

//     // 2. Find Installment
//     const installment = emi.installments.find(
//       (inst) => inst.installmentNumber === Number(installmentNumber)
//     );
//     if (!installment) throw new AppError('Invalid installment number', 404);

//     // 3. Create Payment Record
//     const newPaymentArr = await Payment.create([{
//         organizationId,
//         branchId: branchId || emi.branchId,
//         type: 'inflow',
//         customerId: emi.customerId,
//         invoiceId: emi.invoiceId,
//         amount,
//         paymentMethod,
//         referenceNumber,
//         remarks: remarks || `EMI Installment #${installmentNumber}`,
//         status: 'completed',
//         createdBy,
//         paymentDate: new Date(),
//         transactionMode: 'auto' // Marked as auto because it's linked to EMI logic
//     }], { session });

//     const newPayment = newPaymentArr[0];

//     // 4. Update EMI Installment State
//     installment.paidAmount += amount;
//     installment.paymentId = newPayment._id;

//     if (installment.paidAmount >= installment.totalAmount) {
//       installment.paymentStatus = 'paid';
//     } else if (installment.paidAmount > 0) {
//       installment.paymentStatus = 'partial';
//     }

//     // Check plan completion
//     const allPaid = emi.installments.every((i) => i.paymentStatus === 'paid');
//     if (allPaid) emi.status = 'completed';

//     await emi.save({ session });

//     // 5. 🛑 TRIGGER ACCOUNTING (The Fix)
//     await applyEmiAccounting({
//       organizationId,
//       branchId: branchId || emi.branchId,
//       amount,
//       paymentId: newPayment._id,
//       customerId: emi.customerId,
//       invoiceId: emi.invoiceId,
//       paymentMethod,
//       referenceNumber,
//       createdBy
//     }, session);
    
//     await session.commitTransaction();
//     return { emi, payment: newPayment };
    
//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// };

// /**
//  * Create EMI Plan
//  */
// exports.createEmiPlan = async ({
//   organizationId, branchId, invoiceId, createdBy,
//   downPayment = 0, numberOfInstallments, interestRate = 0, emiStartDate,
// }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).populate('customerId');
//     if (!invoice) throw new AppError('Invoice not found', 404);

//     const existing = await EMI.findOne({ invoiceId });
//     if (existing) throw new AppError('EMI plan already exists for this invoice', 400);

//     // Calculations
//     const grandTotal = invoice.grandTotal;
//     const balanceAmount = grandTotal - downPayment;
//     const monthlyInterestRate = interestRate / 100 / 12;
    
//     // Safety: Handle 0 interest
//     let monthlyEmi = 0;
//     if (interestRate === 0) {
//         monthlyEmi = balanceAmount / numberOfInstallments;
//     } else {
//         monthlyEmi = (balanceAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfInstallments)) / 
//                      (Math.pow(1 + monthlyInterestRate, numberOfInstallments) - 1);
//     }
    
//     // Rounding
//     monthlyEmi = Math.round(monthlyEmi * 100) / 100;

//     // Generate Schedule
//     const installments = [];
//     let emiEndDate;
//     for (let i = 1; i <= numberOfInstallments; i++) {
//       const dueDate = new Date(emiStartDate);
//       dueDate.setMonth(dueDate.getMonth() + i - 1);
      
//       // Calculate specific interest for this month (Declining Balance method usually, but simplified here as flat/fixed for EMI standard)
//       // *Note: Using simplified flat EMI logic for structure consistency*
      
//       emiEndDate = dueDate;
//       installments.push({
//         installmentNumber: i,
//         dueDate,
//         totalAmount: monthlyEmi,
//         principalAmount: monthlyEmi, // Simplified split, strictly user cares about Total
//         interestAmount: 0,
//         paidAmount: 0
//       });
//     }

//     const emi = await EMI.create([{
//         organizationId, branchId, invoiceId,
//         customerId: invoice.customerId._id,
//         totalAmount: grandTotal + (monthlyEmi * numberOfInstallments - balanceAmount), // Total with interest
//         downPayment,
//         balanceAmount,
//         numberOfInstallments,
//         interestRate,
//         emiStartDate,
//         emiEndDate,
//         installments,
//         createdBy
//     }], { session });

//     await session.commitTransaction();
//     return emi[0];
//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// };

// exports.getEmiByInvoice = async (invoiceId, organizationId) => {
//   return await EMI.findOne({ invoiceId, organizationId })
//     .populate('customerId', 'name phone email')
//     .populate('invoiceId', 'invoiceNumber grandTotal');
// };

// exports.getEmiById = async (id, organizationId) => {
//     return await EMI.findOne({ _id: id, organizationId })
//       .populate('customerId', 'name phone email')
//       .populate('invoiceId', 'invoiceNumber grandTotal');
// };

// exports.queryEmis = async (filter, options) => {
//     // Kept for backward compatibility if needed, though Factory is preferred
//     return await EMI.find(filter);
// };

// // ... (Rest of Auto-Allocation / Cron logic preserved as is) ...
// exports.applyPaymentToEmi = async ({ customerId, invoiceId, amount, paymentId, organizationId }) => {
//     // Logic from your file retained, but ensured it's robust
//     const emi = await EMI.findOne({ organizationId, invoiceId, customerId, status: 'active' });
//     if (!emi) return null; // No active EMI, simple payment

//     // This function is called by PaymentController, so Accounting is ALREADY done there.
//     // We just update the installment pointers here.
//     let remaining = amount;
//     for (const inst of emi.installments) {
//         if (remaining <= 0) break;
//         if (inst.paymentStatus === 'paid') continue;
        
//         const due = inst.totalAmount - inst.paidAmount;
//         const apply = Math.min(due, remaining);
        
//         inst.paidAmount += apply;
//         remaining -= apply;
//         inst.paymentId = paymentId; // Link
        
//         if (inst.paidAmount >= inst.totalAmount) inst.paymentStatus = 'paid';
//         else if (inst.paidAmount > 0) inst.paymentStatus = 'partial';
//     }
    
//     if (emi.installments.every(i => i.paymentStatus === 'paid')) emi.status = 'completed';
//     await emi.save();
//     return emi;
// };
