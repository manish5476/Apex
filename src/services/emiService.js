const mongoose = require('mongoose');
const AppError = require('../utils/appError');

const EMI = require('../models/emiModel');
const Invoice = require('../models/invoiceModel');
const Customer = require('../models/customerModel');
const Payment = require('../models/paymentModel');
const Account = require('../models/accountModel');
const AccountEntry = require('../models/accountEntryModel');

/* ======================================================
   INTERNAL: APPLY EMI ACCOUNTING (SINGLE SOURCE)
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

  invoice.paidAmount += amount;
  invoice.balanceAmount = Math.round((invoice.grandTotal - invoice.paidAmount) * 100) / 100;
  invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
  await invoice.save({ session });

  await Customer.findOneAndUpdate(
    { _id: customerId, organizationId },
    { $inc: { outstandingBalance: -amount } },
    { session }
  );

  await AccountEntry.create([
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
  ], { session });
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

    const existing = await EMI.findOne({ invoiceId });
    if (existing) throw new AppError('EMI already exists for this invoice', 400);

    /* DOWN PAYMENT ACCOUNTING */
    if (downPayment > 0) {
      const bank = await Account.findOne({ organizationId, code: '1001' }).session(session);
      const ar = await Account.findOne({ organizationId, code: '1200' }).session(session);
      if (!bank || !ar) throw new AppError('Missing Cash/AR account', 500);

      await AccountEntry.create([
        {
          organizationId,
          branchId,
          accountId: bank._id,
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
          accountId: ar._id,
          debit: 0,
          credit: downPayment,
          description: 'EMI Down Payment',
          referenceType: 'emi_down_payment',
          referenceId: invoiceId,
          createdBy
        }
      ], { session });

      invoice.paidAmount += downPayment;
      invoice.balanceAmount -= downPayment;
      await invoice.save({ session });

      await Customer.findByIdAndUpdate(
        invoice.customerId,
        { $inc: { outstandingBalance: -downPayment } },
        { session }
      );
    }

    const balance = invoice.balanceAmount;
    const emiAmount = Math.round((balance / numberOfInstallments) * 100) / 100;

    const installments = Array.from({ length: numberOfInstallments }).map((_, i) => ({
      installmentNumber: i + 1,
      dueDate: new Date(new Date(emiStartDate).setMonth(new Date(emiStartDate).getMonth() + i)),
      totalAmount: emiAmount,
      paidAmount: 0,
      paymentStatus: 'unpaid'
    }));

    const [emi] = await EMI.create([{
      organizationId,
      branchId,
      invoiceId,
      customerId: invoice.customerId,
      totalAmount: invoice.grandTotal,
      downPayment,
      balanceAmount: balance,
      numberOfInstallments,
      interestRate,
      emiStartDate,
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
   PAY EMI INSTALLMENT (IDEMPOTENT + SAFE)
====================================================== */
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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const emi = await EMI.findOne({ _id: emiId, organizationId }).session(session);
    if (!emi) throw new AppError('EMI not found', 404);

    const inst = emi.installments.find(i => i.installmentNumber === Number(installmentNumber));
    if (!inst) throw new AppError('Invalid installment', 400);
    if (inst.paymentStatus === 'paid') {
      throw new AppError('Installment already paid', 400);
    }

    const [payment] = await Payment.create([{
      organizationId,
      branchId,
      type: 'inflow',
      customerId: emi.customerId,
      invoiceId: emi.invoiceId,
      amount,
      paymentMethod,
      referenceNumber,
      remarks,
      status: 'completed',
      transactionMode: 'auto',
      createdBy
    }], { session });

    inst.paidAmount += amount;
    inst.paymentStatus = inst.paidAmount >= inst.totalAmount ? 'paid' : 'partial';
    inst.paymentId = payment._id;

    if (emi.installments.every(i => i.paymentStatus === 'paid')) {
      emi.status = 'completed';
    }

    await emi.save({ session });

    await applyEmiAccounting({
      organizationId,
      branchId,
      amount,
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
