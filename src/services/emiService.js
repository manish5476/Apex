const Invoice = require('../models/invoiceModel');
const EMI = require('../models/emiModel');
const Customer = require('../models/customerModel');
const mongoose = require('mongoose');
const AppError = require('../utils/appError');

/**
 * Create EMI Plan from Invoice
 */
exports.createEmiPlan = async ({
  organizationId,
  branchId,
  invoiceId,
  createdBy,
  downPayment = 0,
  numberOfInstallments,
  interestRate = 0,
  emiStartDate,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // --- 1️⃣ Fetch Invoice and validate
    const invoice = await Invoice.findOne({
      _id: invoiceId,
      organizationId,
    }).populate('customerId');

    if (!invoice) throw new AppError('Invoice not found', 404);

    if (await EMI.findOne({ invoiceId })) {
      throw new AppError('EMI plan already exists for this invoice', 400);
    }

    // --- 2️⃣ Calculate EMI details
    const totalAmount = invoice.grandTotal;
    const balanceAmount = totalAmount - downPayment;
    const monthlyInterestRate = interestRate / 100 / 12;
    const principalPerInstallment = balanceAmount / numberOfInstallments;

    // --- 3️⃣ Generate Installment Schedule
    const installments = [];
    let emiEndDate;
    for (let i = 1; i <= numberOfInstallments; i++) {
      const dueDate = new Date(emiStartDate);
      dueDate.setMonth(dueDate.getMonth() + i - 1);

      const interestAmount = balanceAmount * monthlyInterestRate;
      const totalAmount = principalPerInstallment + interestAmount;

      emiEndDate = dueDate;

      installments.push({
        installmentNumber: i,
        dueDate,
        principalAmount: principalPerInstallment,
        interestAmount,
        totalAmount,
      });
    }

    // --- 4️⃣ Create EMI document
    const emi = await EMI.create(
      [
        {
          organizationId,
          branchId,
          invoiceId,
          customerId: invoice.customerId._id,
          totalAmount,
          downPayment,
          balanceAmount,
          numberOfInstallments,
          interestRate,
          emiStartDate,
          emiEndDate,
          installments,
          createdBy,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    return emi[0];
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Mark an EMI installment as paid
 */
exports.payEmiInstallment = async ({ emiId, installmentNumber, amount, paymentId }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const emi = await EMI.findById(emiId).session(session);
    if (!emi) throw new AppError('EMI plan not found', 404);

    const installment = emi.installments.find(
      (inst) => inst.installmentNumber === Number(installmentNumber)
    );

    if (!installment) throw new AppError('Invalid installment number', 404);

    installment.paidAmount += amount;
    installment.paymentId = paymentId;

    if (installment.paidAmount >= installment.totalAmount) {
      installment.paymentStatus = 'paid';
    } else if (installment.paidAmount > 0) {
      installment.paymentStatus = 'partial';
    }

    const allPaid = emi.installments.every((i) => i.paymentStatus === 'paid');
    if (allPaid) emi.status = 'completed';

    await emi.save({ session });
    await session.commitTransaction();

    return emi;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Fetch EMI plan details by Invoice
 */
exports.getEmiByInvoice = async (invoiceId, organizationId) => {
  return await EMI.findOne({
    invoiceId,
    organizationId,
  })
    .populate('customerId', 'name phone email')
    .populate('invoiceId', 'invoiceNumber grandTotal');
};

/**
 * Apply payment amount to the correct EMI installments.
 */
exports.applyPaymentToEmi = async ({ customerId, invoiceId, amount, paymentId, organizationId }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const emi = await EMI.findOne({
      organizationId,
      invoiceId,
      customerId,
      status: 'active',
    }).session(session);

    if (!emi) {
      await session.abortTransaction();
      return null;
    }

    let remainingAmount = amount;

    for (const installment of emi.installments) {
      if (remainingAmount <= 0) break;
      if (installment.paymentStatus === 'paid') continue;

      const due = installment.totalAmount - installment.paidAmount;
      const applied = Math.min(due, remainingAmount);

      installment.paidAmount += applied;
      remainingAmount -= applied;

      if (installment.paidAmount >= installment.totalAmount) {
        installment.paymentStatus = 'paid';
      } else if (installment.paidAmount > 0) {
        installment.paymentStatus = 'partial';
      }

      installment.paymentId = paymentId;
    }

    const allPaid = emi.installments.every((i) => i.paymentStatus === 'paid');
    if (allPaid) emi.status = 'completed';

    await emi.save({ session });
    await session.commitTransaction();

    return emi;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};


/**
 * Mark overdue installments automatically
 */
exports.markOverdueInstallments = async () => {
  const today = new Date();
  const emis = await EMI.find({
    status: 'active',
    'installments.dueDate': { $lt: today },
    'installments.paymentStatus': { $in: ['pending', 'partial'] },
  });

  if (!emis.length) return console.log('[EMI Cron] No overdue installments found today.');

  let totalOverdue = 0;

  for (const emi of emis) {
    let updated = false;
    for (const inst of emi.installments) {
      if (
        inst.dueDate < today &&
        (inst.paymentStatus === 'pending' || inst.paymentStatus === 'partial')
      ) {
        inst.paymentStatus = 'overdue';
        updated = true;
        totalOverdue++;
      }
    }
    if (updated) await emi.save();
  }

  console.log(`[EMI Cron] Marked ${totalOverdue} overdue installments on ${today.toDateString()}`);
};

// ⬇️⬇️⬇️ ADDED THESE TWO MISSING FUNCTIONS ⬇️⬇️⬇️

/**
 * Get Specific EMI by ID
 */
exports.getEmiById = async (emiId, organizationId) => {
  return await EMI.findOne({ _id: emiId, organizationId })
    .populate('customerId', 'name phone email')
    .populate('invoiceId', 'invoiceNumber grandTotal');
};

/**
 * Query EMIs with Pagination & Filters
 */
exports.queryEmis = async (filter, options) => {
  const { page = 1, limit = 10, sortBy = 'createdAt:desc' } = options;
  const skip = (page - 1) * limit;

  // Clean filter (remove 'search' as it's not a direct DB field)
  const queryFilter = { ...filter };
  delete queryFilter.search; 

  // Basic count
  const totalResults = await EMI.countDocuments(queryFilter);

  // Build Query
  let query = EMI.find(queryFilter)
    .populate('customerId', 'name')
    .populate('invoiceId', 'invoiceNumber');

  // Sorting
  if (sortBy) {
    const [field, order] = sortBy.split(':');
    query = query.sort({ [field]: order === 'desc' ? -1 : 1 });
  }

  // Pagination
  query = query.skip(skip).limit(limit);

  const results = await query;
  const totalPages = Math.ceil(totalResults / limit);

  return { results, totalResults, totalPages, page, limit };
};

// const Invoice = require('../models/invoiceModel');
// const EMI = require('../models/emiModel');
// const Customer = require('../models/customerModel');
// const mongoose = require('mongoose');
// const AppError = require('../utils/appError');

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
//  * Mark an EMI installment as paid
//  */
// exports.payEmiInstallment = async ({ emiId, installmentNumber, amount, paymentId }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const emi = await EMI.findById(emiId).session(session);
//     if (!emi) throw new AppError('EMI plan not found', 404);

//     const installment = emi.installments.find(
//       (inst) => inst.installmentNumber === Number(installmentNumber)
//     );

//     if (!installment) throw new AppError('Invalid installment number', 404);

//     installment.paidAmount += amount;
//     installment.paymentId = paymentId;

//     if (installment.paidAmount >= installment.totalAmount) {
//       installment.paymentStatus = 'paid';
//     } else if (installment.paidAmount > 0) {
//       installment.paymentStatus = 'partial';
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
//  * Automatically updates installment status and EMI completion state.
//  */
// exports.applyPaymentToEmi = async ({ customerId, invoiceId, amount, paymentId, organizationId }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // --- 1️⃣ Find the active EMI plan ---
//     const emi = await EMI.findOne({
//       organizationId,
//       invoiceId,
//       customerId,
//       status: 'active',
//     }).session(session);

//     if (!emi) {
//       await session.abortTransaction();
//       return null; // no active EMI, just ignore silently
//     }

//     let remainingAmount = amount;

//     // --- 2️⃣ Apply payment to next unpaid installments ---
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

//     // --- 3️⃣ Check if EMI fully paid ---
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
//  * Runs daily via cron job.
//  */
// exports.markOverdueInstallments = async () => {
//   const today = new Date();

//   // Find all EMIs with overdue installments
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
