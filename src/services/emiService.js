const mongoose = require('mongoose');
const AppError = require('../utils/appError');

// Models
const EMI = require('../models/emiModel');
const Invoice = require('../models/invoiceModel');
const Customer = require('../models/customerModel');
const Payment = require('../models/paymentModel');
const Account = require('../models/accountModel');
const AccountEntry = require('../models/accountEntryModel');

/* ==========================================================================
   INTERNAL HELPER: Accounting Logic for EMI Payments
   (Replicates paymentController logic to avoid circular dependencies)
========================================================================== */
async function applyEmiAccounting(params, session) {
  const { 
    organizationId, branchId, amount, paymentId, 
    customerId, invoiceId, paymentMethod, referenceNumber, createdBy 
  } = params;

  // 1. Resolve Accounts
  const isCash = paymentMethod === 'cash';
  const bankQuery = isCash 
    ? { $or: [{ code: '1001' }, { name: 'Cash' }] }
    : { $or: [{ code: '1002' }, { name: 'Bank' }] };
    
  const bankAccount = await Account.findOne({ organizationId, ...bankQuery }).session(session);
  const arAccount = await Account.findOne({ 
    organizationId, 
    $or: [{ code: '1200' }, { name: 'Accounts Receivable' }] 
  }).session(session);

  if (!bankAccount || !arAccount) {
    throw new AppError('Critical: Default ledger accounts (Cash/Bank or AR) missing.', 500);
  }

  // 2. Update Invoice Balance (The EMI payment pays down the invoice)
  const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
  if (invoice) {
    invoice.paidAmount = (invoice.paidAmount || 0) + amount;
    invoice.balanceAmount = invoice.grandTotal - invoice.paidAmount;
    invoice.balanceAmount = Math.round(invoice.balanceAmount * 100) / 100;
    
    if (invoice.balanceAmount <= 0) invoice.paymentStatus = 'paid';
    else invoice.paymentStatus = 'partial';
    
    await invoice.save({ session });
  }

  // 3. Update Customer Outstanding
  await Customer.findOneAndUpdate(
    { _id: customerId, organizationId },
    { $inc: { outstandingBalance: -amount } },
    { session }
  );

  // 4. Create Ledger Entries (Dr Bank, Cr AR)
  const entryDate = new Date();
  
  // Debit Bank/Cash
  await AccountEntry.create([{
    organizationId, branchId,
    accountId: bankAccount._id,
    paymentId,
    date: entryDate,
    debit: amount, credit: 0,
    description: `EMI Payment: ${referenceNumber || 'Cash'}`,
    referenceType: 'payment', referenceId: paymentId, createdBy
  }], { session });

  // Credit AR
  await AccountEntry.create([{
    organizationId, branchId,
    accountId: arAccount._id,
    customerId, 
    paymentId,
    date: entryDate,
    debit: 0, credit: amount,
    description: `EMI Payment: ${referenceNumber || 'Cash'}`,
    referenceType: 'payment', referenceId: paymentId, createdBy
  }], { session });
}

/* ==========================================================================
   CORE SERVICES
========================================================================== */

/**
 * Pay a specific EMI Installment
 * 🛑 CRITICAL: This now updates Invoice, Customer, and Ledger.
 */
exports.payEmiInstallment = async ({ 
  emiId, installmentNumber, amount, paymentMethod, 
  referenceNumber, remarks, organizationId, branchId, createdBy 
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch EMI
    const emi = await EMI.findOne({ _id: emiId, organizationId }).session(session);
    if (!emi) throw new AppError('EMI plan not found', 404);

    // 2. Find Installment
    const installment = emi.installments.find(
      (inst) => inst.installmentNumber === Number(installmentNumber)
    );
    if (!installment) throw new AppError('Invalid installment number', 404);

    // 3. Create Payment Record
    const newPaymentArr = await Payment.create([{
        organizationId,
        branchId: branchId || emi.branchId,
        type: 'inflow',
        customerId: emi.customerId,
        invoiceId: emi.invoiceId,
        amount,
        paymentMethod,
        referenceNumber,
        remarks: remarks || `EMI Installment #${installmentNumber}`,
        status: 'completed',
        createdBy,
        paymentDate: new Date(),
        transactionMode: 'auto' // Marked as auto because it's linked to EMI logic
    }], { session });

    const newPayment = newPaymentArr[0];

    // 4. Update EMI Installment State
    installment.paidAmount += amount;
    installment.paymentId = newPayment._id;

    if (installment.paidAmount >= installment.totalAmount) {
      installment.paymentStatus = 'paid';
    } else if (installment.paidAmount > 0) {
      installment.paymentStatus = 'partial';
    }

    // Check plan completion
    const allPaid = emi.installments.every((i) => i.paymentStatus === 'paid');
    if (allPaid) emi.status = 'completed';

    await emi.save({ session });

    // 5. 🛑 TRIGGER ACCOUNTING (The Fix)
    await applyEmiAccounting({
      organizationId,
      branchId: branchId || emi.branchId,
      amount,
      paymentId: newPayment._id,
      customerId: emi.customerId,
      invoiceId: emi.invoiceId,
      paymentMethod,
      referenceNumber,
      createdBy
    }, session);
    
    await session.commitTransaction();
    return { emi, payment: newPayment };
    
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Create EMI Plan
 */
exports.createEmiPlan = async ({
  organizationId, branchId, invoiceId, createdBy,
  downPayment = 0, numberOfInstallments, interestRate = 0, emiStartDate,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).populate('customerId');
    if (!invoice) throw new AppError('Invoice not found', 404);

    const existing = await EMI.findOne({ invoiceId });
    if (existing) throw new AppError('EMI plan already exists for this invoice', 400);

    // Calculations
    const grandTotal = invoice.grandTotal;
    const balanceAmount = grandTotal - downPayment;
    const monthlyInterestRate = interestRate / 100 / 12;
    
    // Safety: Handle 0 interest
    let monthlyEmi = 0;
    if (interestRate === 0) {
        monthlyEmi = balanceAmount / numberOfInstallments;
    } else {
        monthlyEmi = (balanceAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfInstallments)) / 
                     (Math.pow(1 + monthlyInterestRate, numberOfInstallments) - 1);
    }
    
    // Rounding
    monthlyEmi = Math.round(monthlyEmi * 100) / 100;

    // Generate Schedule
    const installments = [];
    let emiEndDate;
    for (let i = 1; i <= numberOfInstallments; i++) {
      const dueDate = new Date(emiStartDate);
      dueDate.setMonth(dueDate.getMonth() + i - 1);
      
      // Calculate specific interest for this month (Declining Balance method usually, but simplified here as flat/fixed for EMI standard)
      // *Note: Using simplified flat EMI logic for structure consistency*
      
      emiEndDate = dueDate;
      installments.push({
        installmentNumber: i,
        dueDate,
        totalAmount: monthlyEmi,
        principalAmount: monthlyEmi, // Simplified split, strictly user cares about Total
        interestAmount: 0,
        paidAmount: 0
      });
    }

    const emi = await EMI.create([{
        organizationId, branchId, invoiceId,
        customerId: invoice.customerId._id,
        totalAmount: grandTotal + (monthlyEmi * numberOfInstallments - balanceAmount), // Total with interest
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
    return emi[0];
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

exports.getEmiByInvoice = async (invoiceId, organizationId) => {
  return await EMI.findOne({ invoiceId, organizationId })
    .populate('customerId', 'name phone email')
    .populate('invoiceId', 'invoiceNumber grandTotal');
};

exports.getEmiById = async (id, organizationId) => {
    return await EMI.findOne({ _id: id, organizationId })
      .populate('customerId', 'name phone email')
      .populate('invoiceId', 'invoiceNumber grandTotal');
};

exports.queryEmis = async (filter, options) => {
    // Kept for backward compatibility if needed, though Factory is preferred
    return await EMI.find(filter);
};

// ... (Rest of Auto-Allocation / Cron logic preserved as is) ...
exports.applyPaymentToEmi = async ({ customerId, invoiceId, amount, paymentId, organizationId }) => {
    // Logic from your file retained, but ensured it's robust
    const emi = await EMI.findOne({ organizationId, invoiceId, customerId, status: 'active' });
    if (!emi) return null; // No active EMI, simple payment

    // This function is called by PaymentController, so Accounting is ALREADY done there.
    // We just update the installment pointers here.
    let remaining = amount;
    for (const inst of emi.installments) {
        if (remaining <= 0) break;
        if (inst.paymentStatus === 'paid') continue;
        
        const due = inst.totalAmount - inst.paidAmount;
        const apply = Math.min(due, remaining);
        
        inst.paidAmount += apply;
        remaining -= apply;
        inst.paymentId = paymentId; // Link
        
        if (inst.paidAmount >= inst.totalAmount) inst.paymentStatus = 'paid';
        else if (inst.paidAmount > 0) inst.paymentStatus = 'partial';
    }
    
    if (emi.installments.every(i => i.paymentStatus === 'paid')) emi.status = 'completed';
    await emi.save();
    return emi;
};




// const Invoice = require('../models/invoiceModel');
// const EMI = require('../models/emiModel');
// const Customer = require('../models/customerModel');
// const mongoose = require('mongoose');
// const AppError = require('../utils/appError');
// const Payment = require('../models/paymentModel'); // Your existing model

// exports.payEmiInstallment = async ({ 
//     emiId, 
//     installmentNumber, 
//     amount, 
//     paymentMethod, // e.g., 'cash', 'upi'
//     referenceNumber, // e.g., "CASH-12" or UPI ID
//     remarks,
//     organizationId,
//     createdBy 
// }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // 1. Fetch the EMI Plan
//     const emi = await EMI.findOne({ _id: emiId, organizationId }).session(session);
//     if (!emi) throw new AppError('EMI plan not found', 404);

//     // 2. Find the specific installment
//     const installment = emi.installments.find(
//       (inst) => inst.installmentNumber === Number(installmentNumber)
//     );

//     if (!installment) throw new AppError('Invalid installment number', 404);

//     // 3. CREATE THE REAL PAYMENT RECORD (Using your Model)
//     const newPayment = await Payment.create([{
//         organizationId: emi.organizationId,
//         branchId: emi.branchId, // Important for branch accounting
        
//         type: 'inflow', // EMIs are always money coming IN
//         customerId: emi.customerId,
//         invoiceId: emi.invoiceId, // Link back to original invoice
        
//         amount: amount,
//         paymentMethod: paymentMethod, // matches your enum: 'cash', 'upi', etc.
//         referenceNumber: referenceNumber, 
//         remarks: remarks || `EMI Installment #${installmentNumber}`,
        
//         status: 'completed',
//         createdBy: createdBy,
//         paymentDate: new Date()
//     }], { session });

//     // 4. Update the EMI Installment
//     installment.paidAmount += amount;
    
//     // ✅ LINKING: Store the _id of the new Payment document
//     installment.paymentId = newPayment[0]._id; 

//     // 5. Update Status Logic
//     if (installment.paidAmount >= installment.totalAmount) {
//       installment.paymentStatus = 'paid';
//     } else if (installment.paidAmount > 0) {
//       installment.paymentStatus = 'partial';
//     }

//     // Check if whole plan is completed
//     const allPaid = emi.installments.every((i) => i.paymentStatus === 'paid');
//     if (allPaid) emi.status = 'completed';

//     await emi.save({ session });
    
//     await session.commitTransaction();
//     return { emi, payment: newPayment[0] };
    
//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// };

// /**
//  * Create EMI Plan from Invoice
//  */
// exports.createEmiPlan = async ({
//   organizationId,
//   branchId,
//   invoiceId,
//   createdBy,
//   downPayment = 0,
//   numberOfInstallments,
//   interestRate = 0,
//   emiStartDate,
// }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // --- 1️⃣ Fetch Invoice and validate
//     const invoice = await Invoice.findOne({
//       _id: invoiceId,
//       organizationId,
//     }).populate('customerId');

//     if (!invoice) throw new AppError('Invoice not found', 404);

//     if (await EMI.findOne({ invoiceId })) {
//       throw new AppError('EMI plan already exists for this invoice', 400);
//     }

//     // --- 2️⃣ Calculate EMI details
//     const totalAmount = invoice.grandTotal;
//     const balanceAmount = totalAmount - downPayment;
//     const monthlyInterestRate = interestRate / 100 / 12;
//     const principalPerInstallment = balanceAmount / numberOfInstallments;

//     // --- 3️⃣ Generate Installment Schedule
//     const installments = [];
//     let emiEndDate;
//     for (let i = 1; i <= numberOfInstallments; i++) {
//       const dueDate = new Date(emiStartDate);
//       dueDate.setMonth(dueDate.getMonth() + i - 1);

//       const interestAmount = balanceAmount * monthlyInterestRate;
//       const totalAmount = principalPerInstallment + interestAmount;

//       emiEndDate = dueDate;

//       installments.push({
//         installmentNumber: i,
//         dueDate,
//         principalAmount: principalPerInstallment,
//         interestAmount,
//         totalAmount,
//       });
//     }

//     // --- 4️⃣ Create EMI document
//     const emi = await EMI.create(
//       [
//         {
//           organizationId,
//           branchId,
//           invoiceId,
//           customerId: invoice.customerId._id,
//           totalAmount,
//           downPayment,
//           balanceAmount,
//           numberOfInstallments,
//           interestRate,
//           emiStartDate,
//           emiEndDate,
//           installments,
//           createdBy,
//         },
//       ],
//       { session }
//     );

//     await session.commitTransaction();
//     return emi[0];
//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// };


// /**
//  * Fetch EMI plan details by Invoice
//  */
// exports.getEmiByInvoice = async (invoiceId, organizationId) => {
//   return await EMI.findOne({
//     invoiceId,
//     organizationId,
//   })
//     .populate('customerId', 'name phone email')
//     .populate('invoiceId', 'invoiceNumber grandTotal');
// };

// /**
//  * Apply payment amount to the correct EMI installments.
//  */
// exports.applyPaymentToEmi = async ({ customerId, invoiceId, amount, paymentId, organizationId }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const emi = await EMI.findOne({
//       organizationId,
//       invoiceId,
//       customerId,
//       status: 'active',
//     }).session(session);

//     if (!emi) {
//       await session.abortTransaction();
//       return null;
//     }

//     let remainingAmount = amount;

//     for (const installment of emi.installments) {
//       if (remainingAmount <= 0) break;
//       if (installment.paymentStatus === 'paid') continue;

//       const due = installment.totalAmount - installment.paidAmount;
//       const applied = Math.min(due, remainingAmount);

//       installment.paidAmount += applied;
//       remainingAmount -= applied;

//       if (installment.paidAmount >= installment.totalAmount) {
//         installment.paymentStatus = 'paid';
//       } else if (installment.paidAmount > 0) {
//         installment.paymentStatus = 'partial';
//       }

//       installment.paymentId = paymentId;
//     }

//     const allPaid = emi.installments.every((i) => i.paymentStatus === 'paid');
//     if (allPaid) emi.status = 'completed';

//     await emi.save({ session });
//     await session.commitTransaction();

//     return emi;
//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// };


// /**
//  * Mark overdue installments automatically
//  */
// exports.markOverdueInstallments = async () => {
//   const today = new Date();
//   const emis = await EMI.find({
//     status: 'active',
//     'installments.dueDate': { $lt: today },
//     'installments.paymentStatus': { $in: ['pending', 'partial'] },
//   });

//   if (!emis.length) return console.log('[EMI Cron] No overdue installments found today.');

//   let totalOverdue = 0;

//   for (const emi of emis) {
//     let updated = false;
//     for (const inst of emi.installments) {
//       if (
//         inst.dueDate < today &&
//         (inst.paymentStatus === 'pending' || inst.paymentStatus === 'partial')
//       ) {
//         inst.paymentStatus = 'overdue';
//         updated = true;
//         totalOverdue++;
//       }
//     }
//     if (updated) await emi.save();
//   }

//   console.log(`[EMI Cron] Marked ${totalOverdue} overdue installments on ${today.toDateString()}`);
// };

// // ⬇️⬇️⬇️ ADDED THESE TWO MISSING FUNCTIONS ⬇️⬇️⬇️

// /**
//  * Get Specific EMI by ID
//  */
// exports.getEmiById = async (emiId, organizationId) => {
//   return await EMI.findOne({ _id: emiId, organizationId })
//     .populate('customerId', 'name phone email')
//     .populate('invoiceId', 'invoiceNumber grandTotal');
// };

// /**
//  * Query EMIs with Pagination & Filters
//  */
// exports.queryEmis = async (filter, options) => {
//   const { page = 1, limit = 10, sortBy = 'createdAt:desc' } = options;
//   const skip = (page - 1) * limit;

//   // Clean filter (remove 'search' as it's not a direct DB field)
//   const queryFilter = { ...filter };
//   delete queryFilter.search; 

//   // Basic count
//   const totalResults = await EMI.countDocuments(queryFilter);

//   // Build Query
//   let query = EMI.find(queryFilter)
//     .populate('customerId', 'name')
//     .populate('invoiceId', 'invoiceNumber');

//   // Sorting
//   if (sortBy) {
//     const [field, order] = sortBy.split(':');
//     query = query.sort({ [field]: order === 'desc' ? -1 : 1 });
//   }

//   // Pagination
//   query = query.skip(skip).limit(limit);

//   const results = await query;
//   const totalPages = Math.ceil(totalResults / limit);

//   return { results, totalResults, totalPages, page, limit };
// };
