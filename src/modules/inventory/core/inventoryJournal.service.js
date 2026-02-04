const AccountEntry = require('../../accounting/core/accountEntry.model');
const Account = require('../../accounting/core/account.model');

async function getAccount(orgId, code, name, type, session) {
  let acc = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!acc) {
    const created = await Account.create([{
      organizationId: orgId,
      code,
      name,
      type,
      isGroup: false
    }], { session });
    acc = created[0];
  }
  return acc;
}

/* =====================================================
   STOCK ADJUSTMENT JOURNAL
===================================================== */
exports.postStockAdjustmentJournal = async ({
  orgId,
  branchId,
  product,
  quantity,
  type,
  reason,
  userId,
  session
}) => {
  const inventory = await getAccount(orgId, '1500', 'Inventory Asset', 'asset', session);

  const costValue = quantity * (product.purchasePrice || 0);
  if (costValue <= 0) return;

  if (type === 'subtract') {
    const loss = await getAccount(orgId, '5100', 'Inventory Shrinkage', 'expense', session);

    await AccountEntry.create([
      {
        organizationId: orgId,
        branchId,
        accountId: loss._id,
        debit: costValue,
        credit: 0,
        description: `Stock Loss: ${product.name} - ${reason}`,
        referenceType: 'adjustment',
        referenceId: product._id,
        createdBy: userId
      },
      {
        organizationId: orgId,
        branchId,
        accountId: inventory._id,
        debit: 0,
        credit: costValue,
        description: `Inventory Reduction: ${product.name}`,
        referenceType: 'adjustment',
        referenceId: product._id,
        createdBy: userId
      }
    ], { session });
  }

  if (type === 'add') {
    const gain = await getAccount(orgId, '4900', 'Inventory Gain', 'income', session);

    await AccountEntry.create([
      {
        organizationId: orgId,
        branchId,
        accountId: inventory._id,
        debit: costValue,
        credit: 0,
        description: `Inventory Increase: ${product.name}`,
        referenceType: 'adjustment',
        referenceId: product._id,
        createdBy: userId
      },
      {
        organizationId: orgId,
        branchId,
        accountId: gain._id,
        debit: 0,
        credit: costValue,
        description: `Stock Gain: ${product.name} - ${reason}`,
        referenceType: 'adjustment',
        referenceId: product._id,
        createdBy: userId
      }
    ], { session });
  }
};
