// Accounting Module Export
module.exports = {
    // Core
    Account: require('./core/account.model'),
    AccountEntry: require('./core/accountEntry.model'),
    
    // Billing
    Invoice: require('./billing/invoice.model'),
    InvoiceAudit: require('./billing/invoiceAudit.model'),
    
    // Payments
    Payment: require('./payments/payment.model'),
    EMI: require('./payments/emi.model')
};
