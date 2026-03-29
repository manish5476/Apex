// Accounting Module Export
module.exports = {
    // Core
    Account: require('./core/model/account.model'),
    AccountEntry: require('./core/model/accountEntry.model'),
    // Billing
    Invoice: require('./billing/invoice.model'),
    InvoiceAudit: require('./billing/invoiceAudit.model'),
    // Payments
    Payment: require('./payments/payment.model'),
    EMI: require('./payments/emi.model')
};
