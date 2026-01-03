const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Payment = require('../models/paymentModel');
const Purchase = require('../models/purchaseModel');
const Customer = require('../models/customerModel');
const AccountEntry = require('../models/accountEntryModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

/**
 * 1. TOP MISMATCHES
 * Scans the database for integrity issues.
 * Compares: Document Total vs. Sum of Ledger Entries
 */
exports.topMismatches = catchAsync(async (req, res, next) => {
    const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
    
    // We will run three parallel checks
    const [invoiceMismatches, paymentMismatches, customerMismatches] = await Promise.all([
        checkInvoiceIntegrity(orgId),
        checkPaymentIntegrity(orgId),
        checkCustomerBalanceIntegrity(orgId)
    ]);

    const mismatches = [
        ...invoiceMismatches.map(m => ({ ...m, type: 'Invoice Integrity' })),
        ...paymentMismatches.map(m => ({ ...m, type: 'Payment Integrity' })),
        ...customerMismatches.map(m => ({ ...m, type: 'Customer Balance' }))
    ];

    res.status(200).json({
        status: 'success',
        results: mismatches.length,
        data: { mismatches }
    });
});

/**
 * 2. DETAILED DRILL-DOWN
 * Shows exactly why a specific ID is mismatched.
 */
exports.detail = catchAsync(async (req, res, next) => {
    const { type, id } = req.query; // type: 'invoice' | 'payment' | 'customer'
    const orgId = req.user.organizationId;

    let sourceDoc = null;
    let ledgerEntries = [];
    let analysis = {};

    if (type === 'invoice') {
        sourceDoc = await Invoice.findOne({ _id: id, organizationId: orgId });
        ledgerEntries = await AccountEntry.find({ referenceId: id, referenceType: 'invoice' });
        
        const ledgerTotal = ledgerEntries.reduce((sum, e) => sum + (e.credit - e.debit), 0); // Revenue is Credit
        // Note: For AR (Asset), Debit is +, Credit is -. For Sales (Income), Credit is +.
        // We usually check: Total Debits (AR) should equal Invoice Total.
        // OR: Total Credits (Income + Tax) should equal Invoice Total.
        
        // Let's sum Debits to AR
        const arDebits = ledgerEntries
            .filter(e => e.debit > 0) // Usually the AR entry
            .reduce((sum, e) => sum + e.debit, 0);

        analysis = {
            docTotal: sourceDoc.grandTotal,
            ledgerTotal: arDebits,
            diff: sourceDoc.grandTotal - arDebits,
            isBalanced: Math.abs(sourceDoc.grandTotal - arDebits) < 0.01
        };
    } 
    else if (type === 'customer') {
        sourceDoc = await Customer.findOne({ _id: id, organizationId: orgId });
        // Recalculate balance from scratch
        const ledgerStats = await AccountEntry.aggregate([
            { $match: { customerId: new mongoose.Types.ObjectId(id) } },
            { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } }
        ]);
        
        const calculatedBal = ledgerStats.length ? (ledgerStats[0].debit - ledgerStats[0].credit) : 0;
        
        analysis = {
            storedBalance: sourceDoc.outstandingBalance,
            calculatedBalance: calculatedBal,
            diff: sourceDoc.outstandingBalance - calculatedBal,
            isBalanced: Math.abs(sourceDoc.outstandingBalance - calculatedBal) < 0.01
        };
    }

    res.status(200).json({
        status: 'success',
        data: { sourceDoc, ledgerEntries, analysis }
    });
});

/* ==========================================================================
   INTERNAL HELPERS (The "Auditor" Logic)
   ========================================================================== */

// Check 1: Does (Invoice Grand Total) == (Sum of Ledger Debits/Credits)?
async function checkInvoiceIntegrity(orgId) {
    return await Invoice.aggregate([
        { $match: { organizationId: orgId, status: { $ne: 'cancelled' } } },
        {
            $lookup: {
                from: 'accountentries',
                localField: '_id',
                foreignField: 'referenceId',
                as: 'ledger'
            }
        },
        {
            $addFields: {
                // Sum all credits (Sales + Tax). Should match Grand Total.
                ledgerSum: { $sum: "$ledger.credit" } 
            }
        },
        {
            $project: {
                invoiceNumber: 1,
                grandTotal: 1,
                ledgerSum: 1,
                diff: { $abs: { $subtract: ["$grandTotal", "$ledgerSum"] } }
            }
        },
        { $match: { diff: { $gt: 0.05 } } }, // Allow tiny float rounding errors
        { $sort: { diff: -1 } },
        { $limit: 20 }
    ]);
}

// Check 2: Does (Payment Amount) == (Sum of Ledger Debits to Bank)?
async function checkPaymentIntegrity(orgId) {
    return await Payment.aggregate([
        { $match: { organizationId: orgId, status: 'completed' } },
        {
            $lookup: {
                from: 'accountentries',
                localField: '_id',
                foreignField: 'referenceId',
                as: 'ledger'
            }
        },
        {
            $addFields: {
                // For Inflow: Payment Amount should match Ledger Debit (Cash/Bank)
                ledgerSum: { $sum: "$ledger.debit" }
            }
        },
        {
            $project: {
                referenceNumber: 1,
                amount: 1,
                ledgerSum: 1,
                diff: { $abs: { $subtract: ["$amount", "$ledgerSum"] } }
            }
        },
        { $match: { diff: { $gt: 0.05 } } },
        { $limit: 20 }
    ]);
}

// Check 3: Does (Customer Stored Balance) == (Calculated Ledger Balance)?
// This finds "Drift" where you updated the customer but failed to write a ledger entry.
async function checkCustomerBalanceIntegrity(orgId) {
    // 1. Get all customers with balance
    const customers = await Customer.find({ organizationId: orgId }).select('name outstandingBalance').lean();
    
    // 2. Get real balances from Ledger
    const realBalances = await AccountEntry.aggregate([
        { $match: { organizationId: orgId, customerId: { $ne: null } } },
        { 
            $group: { 
                _id: "$customerId", 
                balance: { $sum: { $subtract: ["$debit", "$credit"] } } 
            } 
        }
    ]);

    const balanceMap = {};
    realBalances.forEach(b => balanceMap[b._id.toString()] = b.balance);

    const mismatches = [];
    
    for (const cust of customers) {
        const real = balanceMap[cust._id.toString()] || 0;
        const stored = cust.outstandingBalance || 0;
        
        if (Math.abs(real - stored) > 1.00) { // Tolerance of $1
            mismatches.push({
                id: cust._id,
                name: cust.name,
                storedBalance: stored,
                realLedgerBalance: real,
                diff: stored - real
            });
        }
    }

    return mismatches;
}