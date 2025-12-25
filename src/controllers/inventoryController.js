const mongoose = require('mongoose');
const Product = require('../models/productModel');
const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel'); 
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { runInTransaction } = require('../utils/runInTransaction');

// Helper: Ensure Account Exists
async function getOrInitAccount(orgId, type, name, code, session) {
  let account = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!account) {
    account = await Account.create([{ organizationId: orgId, name, code, type, isGroup: false }], { session });
    return account[0];
  }
  return account;
}

// 1. TRANSFER STOCK (Branch A -> Branch B)
exports.transferStock = catchAsync(async (req, res, next) => {
    const { productId, fromBranchId, toBranchId, quantity, notes } = req.body;

    if (quantity <= 0) return next(new AppError("Quantity must be positive", 400));
    if (fromBranchId === toBranchId) return next(new AppError("Cannot transfer to same branch", 400));

    await runInTransaction(async (session) => {
        const product = await Product.findOne({ _id: productId, organizationId: req.user.organizationId }).session(session);
        if (!product) throw new AppError("Product not found", 404);

        // Source Inventory
        const sourceInv = product.inventory.find(i => String(i.branchId) === String(fromBranchId));
        if (!sourceInv || sourceInv.quantity < quantity) {
            throw new AppError(`Insufficient stock at Source Branch. Available: ${sourceInv ? sourceInv.quantity : 0}`, 400);
        }

        // Target Inventory
        let targetInv = product.inventory.find(i => String(i.branchId) === String(toBranchId));
        if (!targetInv) {
            product.inventory.push({ branchId: toBranchId, quantity: 0, reorderLevel: 10 });
            targetInv = product.inventory[product.inventory.length - 1];
        }

        // Execute Move
        sourceInv.quantity -= quantity;
        targetInv.quantity += quantity;
        
        await product.save({ session });

        // Audit Log (Inventory Movement is not a financial ledger event unless branches are separate entities, 
        // but we assume single entity here. We just log it.)
        // If you want GL entries, it would be Dr Inventory (Branch B) / Cr Inventory (Branch A).
    }, 3, { action: "STOCK_TRANSFER", userId: req.user._id });

    res.status(200).json({ status: "success", message: "Stock transferred successfully" });
});

// 2. STOCK ADJUSTMENT (Shrinkage/Damage/Correction)
// This CRITICAL function fixes "Computer says 10, Shelf says 8" errors.
exports.adjustStock = catchAsync(async (req, res, next) => {
    const { productId, branchId, type, quantity, reason } = req.body; // type: 'add' or 'subtract'

    await runInTransaction(async (session) => {
        const product = await Product.findOne({ _id: productId, organizationId: req.user.organizationId }).session(session);
        if (!product) throw new AppError("Product not found", 404);

        const inv = product.inventory.find(i => String(i.branchId) === String(branchId));
        if (!inv) throw new AppError("Product not tracked at this branch", 400);

        // Accounting Setup
        const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
        const adjustmentAcc = await getOrInitAccount(req.user.organizationId, 'expense', 'Inventory Shrinkage/Gain', '5900', session);
        
        const costValue = quantity * product.purchasePrice;

        if (type === 'subtract') {
            if (inv.quantity < quantity) throw new AppError("Cannot subtract more than current stock", 400);
            inv.quantity -= quantity;

            // Dr Expense (Loss), Cr Asset (Inventory)
            await AccountEntry.create([{
                organizationId: req.user.organizationId, branchId, accountId: adjustmentAcc._id,
                date: new Date(), debit: costValue, credit: 0, description: `Stock Adj (Loss): ${product.name} - ${reason}`,
                referenceType: 'adjustment', referenceId: product._id, createdBy: req.user._id
            }, {
                organizationId: req.user.organizationId, branchId, accountId: inventoryAcc._id,
                date: new Date(), debit: 0, credit: costValue, description: `Stock Adj (Loss): ${product.name} - ${reason}`,
                referenceType: 'adjustment', referenceId: product._id, createdBy: req.user._id
            }], { session });

        } else if (type === 'add') {
            inv.quantity += quantity;

            // Dr Asset (Inventory), Cr Income/Equity (Gain)
            // Note: Gain usually credits a Contra-Expense or Income.
            await AccountEntry.create([{
                organizationId: req.user.organizationId, branchId, accountId: inventoryAcc._id,
                date: new Date(), debit: costValue, credit: 0, description: `Stock Adj (Gain): ${product.name} - ${reason}`,
                referenceType: 'adjustment', referenceId: product._id, createdBy: req.user._id
            }, {
                organizationId: req.user.organizationId, branchId, accountId: adjustmentAcc._id,
                date: new Date(), debit: 0, credit: costValue, description: `Stock Adj (Gain): ${product.name} - ${reason}`,
                referenceType: 'adjustment', referenceId: product._id, createdBy: req.user._id
            }], { session });
        }

        await product.save({ session });
    }, 3, { action: "STOCK_ADJUSTMENT", userId: req.user._id });

    res.status(200).json({ status: "success", message: "Stock adjusted and Ledger updated" });
});

// 3. PRODUCT HISTORY (Audit Trail)
exports.getProductHistory = catchAsync(async (req, res, next) => {
    const { id } = req.params; // Product ID
    // Find all invoices, purchases, and adjustments involving this product
    // (Simplified for performance: We look at AccountEntries linked to this product or Invoices containing it)
    // This is a complex aggregation, so for V1 we return just the current state.
    // Ideally, you query the Invoice/Purchase collections for items.productId == id.
    res.status(200).json({ status: "success", message: "Feature coming in V2" });
});