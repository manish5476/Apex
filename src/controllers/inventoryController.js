const Product = require('../models/productModel');
const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { runInTransaction } = require('../utils/runInTransaction');

async function getAccount(orgId, code, name, type, session) {
  let acc = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!acc) {
    acc = (await Account.create([{
      organizationId: orgId, code, name, type, isGroup: false
    }], { session }))[0];
  }
  return acc;
}

/* =====================================================
   STOCK TRANSFER (NO ACCOUNTING)
===================================================== */
exports.transferStock = catchAsync(async (req, res) => {
  const { productId, fromBranchId, toBranchId, quantity } = req.body;

  if (quantity <= 0) throw new AppError('Invalid quantity', 400);
  if (fromBranchId === toBranchId) throw new AppError('Same branch transfer blocked', 400);

  await runInTransaction(async (session) => {
    const product = await Product.findOne({
      _id: productId,
      organizationId: req.user.organizationId
    }).session(session);

    if (!product) throw new AppError('Product not found', 404);

    const from = product.inventory.find(i => i.branchId.equals(fromBranchId));
    if (!from || from.quantity < quantity)
      throw new AppError('Insufficient stock', 400);

    let to = product.inventory.find(i => i.branchId.equals(toBranchId));
    if (!to) {
      product.inventory.push({ branchId: toBranchId, quantity: 0 });
      to = product.inventory.at(-1);
    }

    from.quantity -= quantity;
    to.quantity += quantity;

    await product.save({ session });
  });

  res.json({ status: 'success' });
});

/* =====================================================
   STOCK ADJUSTMENT (GAIN / LOSS)
===================================================== */
exports.adjustStock = catchAsync(async (req, res) => {
  const { productId, branchId, type, quantity, reason } = req.body;
  if (!['add', 'subtract'].includes(type)) throw new AppError('Invalid type', 400);

  await runInTransaction(async (session) => {
    const product = await Product.findOne({
      _id: productId,
      organizationId: req.user.organizationId
    }).session(session);

    if (!product) throw new AppError('Product not found', 404);

    const inv = product.inventory.find(i => i.branchId.equals(branchId));
    if (!inv) throw new AppError('Branch inventory missing', 400);

    const cost = quantity * (product.purchasePrice || 0);
    if (type === 'subtract' && inv.quantity < quantity)
      throw new AppError('Insufficient stock', 400);

    inv.quantity += type === 'add' ? quantity : -quantity;
    await product.save({ session });

    if (cost <= 0) return;

    const inventory = await getAccount(req.user.organizationId, '1500', 'Inventory Asset', 'asset', session);
    const adj = await getAccount(
      req.user.organizationId,
      type === 'add' ? '4900' : '5100',
      type === 'add' ? 'Inventory Gain' : 'Inventory Shrinkage',
      type === 'add' ? 'income' : 'expense',
      session
    );

    await AccountEntry.insertMany([
      {
        organizationId: req.user.organizationId,
        branchId,
        accountId: type === 'add' ? inventory._id : adj._id,
        debit: type === 'add' ? cost : 0,
        credit: type === 'add' ? 0 : cost,
        description: reason,
        referenceType: 'adjustment',
        referenceId: product._id,
        createdBy: req.user._id
      },
      {
        organizationId: req.user.organizationId,
        branchId,
        accountId: type === 'add' ? adj._id : inventory._id,
        debit: type === 'add' ? 0 : cost,
        credit: type === 'add' ? cost : 0,
        description: reason,
        referenceType: 'adjustment',
        referenceId: product._id,
        createdBy: req.user._id
      }
    ], { session });
  });

  res.json({ status: 'success' });
});


// const Product = require('../models/productModel');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');
// const { runInTransaction } = require('../utils/runInTransaction');
// const { postStockAdjustmentJournal } = require('../services/inventoryJournalService');

// /* =====================================================
//    STOCK TRANSFER (NO ACCOUNTING)
// ===================================================== */
// exports.transferStock = catchAsync(async (req, res, next) => {
//   const { productId, fromBranchId, toBranchId, quantity } = req.body;

//   if (quantity <= 0) return next(new AppError('Quantity must be positive', 400));
//   if (fromBranchId === toBranchId) return next(new AppError('Cannot transfer to same branch', 400));

//   await runInTransaction(async (session) => {
//     const product = await Product.findOne({
//       _id: productId,
//       organizationId: req.user.organizationId
//     }).session(session);

//     if (!product) throw new AppError('Product not found', 404);

//     const source = product.inventory.find(i => String(i.branchId) === String(fromBranchId));
//     if (!source || source.quantity < quantity) {
//       throw new AppError(`Insufficient stock. Available: ${source?.quantity || 0}`, 400);
//     }

//     let target = product.inventory.find(i => String(i.branchId) === String(toBranchId));
//     if (!target) {
//       product.inventory.push({ branchId: toBranchId, quantity: 0, reorderLevel: 10 });
//       target = product.inventory[product.inventory.length - 1];
//     }

//     source.quantity -= quantity;
//     target.quantity += quantity;

//     await product.save({ session });
//   }, 3, { action: 'STOCK_TRANSFER', userId: req.user._id });

//   res.status(200).json({ status: 'success', message: 'Stock transferred successfully' });
// });

// /* =====================================================
//    STOCK ADJUSTMENT (ACCOUNTING VIA SERVICE)
// ===================================================== */
// exports.adjustStock = catchAsync(async (req, res, next) => {
//   const { productId, branchId, type, quantity, reason } = req.body;

//   if (!['add', 'subtract'].includes(type)) {
//     return next(new AppError('Invalid adjustment type', 400));
//   }
//   if (quantity <= 0) {
//     return next(new AppError('Quantity must be positive', 400));
//   }

//   await runInTransaction(async (session) => {
//     const product = await Product.findOne({
//       _id: productId,
//       organizationId: req.user.organizationId
//     }).session(session);

//     if (!product) throw new AppError('Product not found', 404);

//     const inventory = product.inventory.find(i => String(i.branchId) === String(branchId));
//     if (!inventory) throw new AppError('Product not tracked at this branch', 400);

//     if (type === 'subtract' && inventory.quantity < quantity) {
//       throw new AppError('Insufficient stock for adjustment', 400);
//     }

//     inventory.quantity += type === 'add' ? quantity : -quantity;
//     await product.save({ session });

//     await postStockAdjustmentJournal({
//       orgId: req.user.organizationId,
//       branchId,
//       product,
//       quantity,
//       type,
//       reason,
//       userId: req.user._id,
//       session
//     });

//   }, 3, { action: 'STOCK_ADJUSTMENT', userId: req.user._id });

//   res.status(200).json({ status: 'success', message: 'Stock adjusted successfully' });
// });

// exports.getProductHistory = catchAsync(async (req, res) => {
//   res.status(200).json({ status: 'success', message: 'Coming in V2' });
// });


// // const mongoose = require('mongoose');
// // const Product = require('../models/productModel');
// // const AccountEntry = require('../models/accountEntryModel');
// // const Account = require('../models/accountModel');
// // const catchAsync = require('../utils/catchAsync');
// // const AppError = require('../utils/appError');
// // const { runInTransaction } = require('../utils/runInTransaction');

// // async function getOrInitAccount(orgId, type, name, code, session) {
// //     let account = await Account.findOne({ organizationId: orgId, code }).session(session);
// //     if (!account) {
// //         account = await Account.create([{ organizationId: orgId, name, code, type, isGroup: false }], { session });
// //         return account[0];
// //     }
// //     return account;
// // }

// // exports.transferStock = catchAsync(async (req, res, next) => {
// //     const { productId, fromBranchId, toBranchId, quantity, notes } = req.body;
// //     if (quantity <= 0) return next(new AppError("Quantity must be positive", 400));
// //     if (fromBranchId === toBranchId) return next(new AppError("Cannot transfer to same branch", 400));
// //     await runInTransaction(async (session) => {
// //         const product = await Product.findOne({ _id: productId, organizationId: req.user.organizationId }).session(session);
// //         if (!product) throw new AppError("Product not found", 404);
// //         const sourceInv = product.inventory.find(i => String(i.branchId) === String(fromBranchId));
// //         if (!sourceInv || sourceInv.quantity < quantity) {
// //             throw new AppError(`Insufficient stock at Source Branch. Available: ${sourceInv ? sourceInv.quantity : 0}`, 400);
// //         }
// //         let targetInv = product.inventory.find(i => String(i.branchId) === String(toBranchId));
// //         if (!targetInv) {
// //             product.inventory.push({ branchId: toBranchId, quantity: 0, reorderLevel: 10 });
// //             targetInv = product.inventory[product.inventory.length - 1];
// //         }
// //         sourceInv.quantity -= quantity;
// //         targetInv.quantity += quantity;
// //         await product.save({ session });
// //     }, 3, { action: "STOCK_TRANSFER", userId: req.user._id });

// //     res.status(200).json({ status: "success", message: "Stock transferred successfully" });
// // });

// // exports.adjustStock = catchAsync(async (req, res, next) => {
// //     const { productId, branchId, type, quantity, reason } = req.body

// //     await runInTransaction(async (session) => {
// //         const product = await Product.findOne({ _id: productId, organizationId: req.user.organizationId }).session(session);
// //         if (!product) throw new AppError("Product not found", 404);

// //         const inv = product.inventory.find(i => String(i.branchId) === String(branchId));
// //         if (!inv) throw new AppError("Product not tracked at this branch", 400);

// //         const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
// //         const adjustmentAcc = await getOrInitAccount(req.user.organizationId, 'expense', 'Inventory Shrinkage/Gain', '5900', session);

// //         const costValue = quantity * product.purchasePrice;

// //         if (type === 'subtract') {
// //             if (inv.quantity < quantity) throw new AppError("Cannot subtract more than current stock", 400);
// //             inv.quantity -= quantity;
// //             await AccountEntry.create([{
// //                 organizationId: req.user.organizationId, branchId, accountId: adjustmentAcc._id,
// //                 date: new Date(), debit: costValue, credit: 0, description: `Stock Adj (Loss): ${product.name} - ${reason}`,
// //                 referenceType: 'adjustment', referenceId: product._id, createdBy: req.user._id
// //             },
// //             {
// //                 organizationId: req.user.organizationId, branchId, accountId: inventoryAcc._id,
// //                 date: new Date(), debit: 0, credit: costValue, description: `Stock Adj (Loss): ${product.name} - ${reason}`,
// //                 referenceType: 'adjustment', referenceId: product._id, createdBy: req.user._id
// //             }], { session });

// //         } else if (type === 'add') {
// //             inv.quantity += quantity;

// //             await AccountEntry.create([{
// //                 organizationId: req.user.organizationId, branchId, accountId: inventoryAcc._id,
// //                 date: new Date(), debit: costValue, credit: 0, description: `Stock Adj (Gain): ${product.name} - ${reason}`,
// //                 referenceType: 'adjustment', referenceId: product._id, createdBy: req.user._id
// //             }, {
// //                 organizationId: req.user.organizationId, branchId, accountId: adjustmentAcc._id,
// //                 date: new Date(), debit: 0, credit: costValue, description: `Stock Adj (Gain): ${product.name} - ${reason}`,
// //                 referenceType: 'adjustment', referenceId: product._id, createdBy: req.user._id
// //             }], { session });
// //         }

// //         await product.save({ session });
// //     }, 3, { action: "STOCK_ADJUSTMENT", userId: req.user._id });

// //     res.status(200).json({ status: "success", message: "Stock adjusted and Ledger updated" });
// // });

// // exports.getProductHistory = catchAsync(async (req, res, next) => {
// //     const { id } = req.params
// //     res.status(200).json({ status: "success", message: "Feature coming in V2" });
// // });