const Account = require('../models/accountModel');
const AccountEntry = require('../models/accountEntryModel');

async function acc(orgId, code, name, type, session) {
  let a = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!a) {
    a = (await Account.create([{ organizationId: orgId, code, name, type }], { session }))[0];
  }
  return a;
}

exports.postInvoiceJournal = async ({
  orgId, branchId, invoice, customerId, items, userId, session
}) => {
  const ar = await acc(orgId, '1200', 'Accounts Receivable', 'asset', session);
  const sales = await acc(orgId, '4000', 'Sales', 'income', session);
  const tax = invoice.totalTax > 0
    ? await acc(orgId, '2100', 'Tax Payable', 'liability', session)
    : null;
  const inv = await acc(orgId, '1500', 'Inventory Asset', 'asset', session);
  const cogs = await acc(orgId, '5000', 'COGS', 'expense', session);

  const entries = [];

  entries.push({
    organizationId: orgId,
    branchId,
    accountId: ar._id,
    customerId,
    debit: invoice.grandTotal,
    credit: 0,
    referenceType: 'invoice',
    referenceId: invoice._id,
    createdBy: userId
  });

  entries.push({
    organizationId: orgId,
    branchId,
    accountId: sales._id,
    debit: 0,
    credit: invoice.grandTotal - (invoice.totalTax || 0),
    referenceType: 'invoice',
    referenceId: invoice._id,
    createdBy: userId
  });

  if (tax) {
    entries.push({
      organizationId: orgId,
      branchId,
      accountId: tax._id,
      debit: 0,
      credit: invoice.totalTax,
      referenceType: 'invoice',
      referenceId: invoice._id,
      createdBy: userId
    });
  }

  for (const i of items) {
    const cost = (i.purchasePrice || 0) * i.quantity;
    if (!cost) continue;

    entries.push(
      { organizationId: orgId, branchId, accountId: cogs._id, debit: cost, credit: 0, referenceType: 'invoice', referenceId: invoice._id, createdBy: userId },
      { organizationId: orgId, branchId, accountId: inv._id, debit: 0, credit: cost, referenceType: 'invoice', referenceId: invoice._id, createdBy: userId }
    );
  }

  await AccountEntry.insertMany(entries, { session });
};


// const AccountEntry = require('../models/accountEntryModel');
// const Account = require('../models/accountModel');

// async function getAccount(orgId, code, name, type, session) {
//   let acc = await Account.findOne({ organizationId: orgId, code }).session(session);
//   if (!acc) {
//     const created = await Account.create([{
//       organizationId: orgId,
//       code,
//       name,
//       type,
//       isGroup: false
//     }], { session });
//     acc = created[0];
//   }
//   return acc;
// }

// /* =====================================================
//    SALES INVOICE JOURNAL
// ===================================================== */
// exports.postInvoiceJournal = async ({
//   orgId,
//   branchId,
//   invoice,
//   customerId,
//   items,
//   userId,
//   session
// }) => {
//   const ar = await getAccount(orgId, '1200', 'Accounts Receivable', 'asset', session);
//   const sales = await getAccount(orgId, '4000', 'Sales', 'income', session);
//   const tax = invoice.totalTax > 0
//     ? await getAccount(orgId, '2100', 'Tax Payable', 'liability', session)
//     : null;

//   const inventory = await getAccount(orgId, '1500', 'Inventory Asset', 'asset', session);
//   const cogs = await getAccount(orgId, '5000', 'Cost of Goods Sold', 'expense', session);

//   const netRevenue = invoice.grandTotal - (invoice.totalTax || 0);

//   const entries = [];

//   // Dr AR
//   entries.push({
//     organizationId: orgId,
//     branchId,
//     accountId: ar._id,
//     customerId,
//     debit: invoice.grandTotal,
//     credit: 0,
//     description: `Invoice #${invoice.invoiceNumber}`,
//     referenceType: 'invoice',
//     referenceId: invoice._id,
//     createdBy: userId
//   });

//   // Cr Sales
//   entries.push({
//     organizationId: orgId,
//     branchId,
//     accountId: sales._id,
//     debit: 0,
//     credit: netRevenue,
//     description: `Sales #${invoice.invoiceNumber}`,
//     referenceType: 'invoice',
//     referenceId: invoice._id,
//     createdBy: userId
//   });

//   // Cr Tax
//   if (tax) {
//     entries.push({
//       organizationId: orgId,
//       branchId,
//       accountId: tax._id,
//       debit: 0,
//       credit: invoice.totalTax,
//       description: `Tax #${invoice.invoiceNumber}`,
//       referenceType: 'invoice',
//       referenceId: invoice._id,
//       createdBy: userId
//     });
//   }

//   // COGS + Inventory
//   for (const item of items) {
//     const cost = (item.purchasePrice || 0) * item.quantity;
//     if (cost <= 0) continue;

//     entries.push(
//       {
//         organizationId: orgId,
//         branchId,
//         accountId: cogs._id,
//         debit: cost,
//         credit: 0,
//         description: `COGS: ${item.name}`,
//         referenceType: 'invoice',
//         referenceId: invoice._id,
//         createdBy: userId
//       },
//       {
//         organizationId: orgId,
//         branchId,
//         accountId: inventory._id,
//         debit: 0,
//         credit: cost,
//         description: `Inventory Out: ${item.name}`,
//         referenceType: 'invoice',
//         referenceId: invoice._id,
//         createdBy: userId
//       }
//     );
//   }

//   await AccountEntry.insertMany(entries, { session });
// };
