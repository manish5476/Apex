const mongoose = require('mongoose');
const AccountEntry = require('../../modules/accounting/core/model/accountEntry.model');

async function runIntegrityCheck() {
    console.log("🕵️ Starting Nightly Accounting Integrity Check...");

    const stats = await AccountEntry.aggregate([
        { 
            $group: {
                _id: "$organizationId",
                totalDebit: { $sum: "$debit" },
                totalCredit: { $sum: "$credit" }
            }
        }
    ]);

    for (const org of stats) {
        const diff = Math.abs(org.totalDebit - org.totalCredit);
        
        // Allow tiny floating point error (0.001)
        if (diff > 0.01) {
            console.error(`🚨 CRITICAL: Organization ${org._id} is OUT OF BALANCE!`);
            console.error(`   Debit: ${org.totalDebit}, Credit: ${org.totalCredit}, Diff: ${diff}`);
            // TODO: Send Urgent Email to Admin / CTO
        } else {
            console.log(`✅ Org ${org._id} is Balanced.`);
        }
    }
}