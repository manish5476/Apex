// src/controllers/salesReturnController.js
const mongoose = require('mongoose');
const SalesReturn = require('../models/salesReturnModel');
const Invoice = require('../models/invoiceModel');
const Product = require('../models/productModel');
const Customer = require('../models/customerModel');
const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { runInTransaction } = require('../utils/runInTransaction');

// Helper to ensure accounts exist (reused from your invoice controller)
async function getOrInitAccount(orgId, type, name, code, session) {
    let account = await Account.findOne({ organizationId: orgId, code }).session(session);
    if (!account) {
        account = await Account.create([{ organizationId: orgId, name, code, type, isGroup: false }], { session });
        return account[0];
    }
    return account;
}

exports.createReturn = catchAsync(async (req, res, next) => {
    const { invoiceId, items, reason, restock = true } = req.body;
    // items input format: [{ productId, quantity }]

    await runInTransaction(async (session) => {
        // 1. Fetch Original Invoice
        const invoice = await Invoice.findOne({ _id: invoiceId, organizationId: req.user.organizationId }).session(session);
        if (!invoice) throw new AppError('Invoice not found', 404);

        // 2. Validate Items & Calculate Totals
        const returnItems = [];
        let totalRefund = 0;
        let totalTaxReversal = 0;
        let totalSubTotalReversal = 0;

        for (const reqItem of items) {
            // Find item in original invoice
            const originalItem = invoice.items.find(i => String(i.productId) === String(reqItem.productId));
            if (!originalItem) throw new AppError(`Product ${reqItem.productId} not found in original invoice`, 400);

            if (reqItem.quantity > originalItem.quantity) {
                throw new AppError(`Cannot return more than purchased. Item: ${originalItem.name}`, 400);
            }

            // Calculate Pro-rata Financials
            const ratio = reqItem.quantity / originalItem.quantity;
            
            // Assuming originalItem.discount is total line discount
            const itemDiscount = (originalItem.discount || 0) * ratio; 
            
            // Calculate Line Tax
            const lineBasePrice = originalItem.price * reqItem.quantity;
            const itemTax = ((originalItem.taxRate || 0) / 100) * (lineBasePrice - itemDiscount);
            
            const itemRefund = lineBasePrice - itemDiscount + itemTax;

            totalSubTotalReversal += lineBasePrice;
            totalTaxReversal += itemTax;
            totalRefund += itemRefund;

            returnItems.push({
                productId: reqItem.productId,
                name: originalItem.name,
                quantity: reqItem.quantity,
                unitPrice: originalItem.price,
                taxAmount: itemTax,
                discountAmount: itemDiscount,
                refundAmount: itemRefund
            });

            // 3. Restock Inventory
            if (restock) {
                await Product.findOneAndUpdate(
                    { _id: reqItem.productId, "inventory.branchId": invoice.branchId },
                    { $inc: { "inventory.$.quantity": reqItem.quantity } },
                    { session }
                );
            }
        }

        // 4. Create Return Record
        // Generate Return Number
        const lastRet = await SalesReturn.findOne({ organizationId: req.user.organizationId }).sort({ createdAt: -1 });
        const lastNum = lastRet ? parseInt(lastRet.returnNumber.replace(/\D/g, '')) || 0 : 0;
        const returnNumber = `RET-${String(lastNum + 1).padStart(4, '0')}`;

        const newReturn = await SalesReturn.create([{
            organizationId: req.user.organizationId,
            branchId: invoice.branchId,
            invoiceId: invoice._id,
            customerId: invoice.customerId,
            returnNumber,
            items: returnItems,
            subTotal: totalSubTotalReversal,
            taxTotal: totalTaxReversal,
            totalRefundAmount: totalRefund,
            reason,
            createdBy: req.user._id
        }], { session });

        // 5. Update Customer Balance (Reduce Debt / Create Credit)
        await Customer.findByIdAndUpdate(invoice.customerId, { 
            $inc: { outstandingBalance: -totalRefund } 
        }, { session });

        // 6. Ledger Entries (Credit Note Logic)
        const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
        const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);

        // Dr Sales (Reduce Revenue)
        const netRevenueReversal = totalRefund - totalTaxReversal;
        await AccountEntry.create([{
            organizationId: req.user.organizationId,
            branchId: invoice.branchId,
            accountId: salesAccount._id,
            date: new Date(),
            debit: netRevenueReversal,
            credit: 0,
            description: `Sales Return: #${returnNumber} for Invoice #${invoice.invoiceNumber}`,
            referenceType: 'credit_note',
            referenceNumber: returnNumber,
            referenceId: newReturn[0]._id,
            createdBy: req.user._id
        }], { session });

        // Dr Tax Payable (Reduce Liability)
        if (totalTaxReversal > 0) {
            const taxAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Tax Payable', '2100', session);
            await AccountEntry.create([{
                organizationId: req.user.organizationId,
                branchId: invoice.branchId,
                accountId: taxAccount._id,
                date: new Date(),
                debit: totalTaxReversal,
                credit: 0,
                description: `Tax Reversal: #${returnNumber}`,
                referenceType: 'credit_note',
                referenceNumber: returnNumber,
                referenceId: newReturn[0]._id,
                createdBy: req.user._id
            }], { session });
        }

        // Cr Accounts Receivable (Reduce Customer Debt)
        await AccountEntry.create([{
            organizationId: req.user.organizationId,
            branchId: invoice.branchId,
            accountId: arAccount._id,
            customerId: invoice.customerId,
            date: new Date(),
            debit: 0,
            credit: totalRefund,
            description: `Credit Note: #${returnNumber}`,
            referenceType: 'credit_note',
            referenceNumber: returnNumber,
            referenceId: newReturn[0]._id,
            createdBy: req.user._id
        }], { session });

    }, 3, { action: "CREATE_RETURN", userId: req.user._id });

    res.status(201).json({ status: "success", message: "Return processed successfully" });
});

exports.getReturns = catchAsync(async (req, res) => {
    const returns = await SalesReturn.find({ organizationId: req.user.organizationId })
        .populate('customerId', 'name')
        .populate('items.productId', 'name sku')
        .sort({ createdAt: -1 });
        
    res.status(200).json({ status: 'success', data: returns });
});
