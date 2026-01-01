// Accounting Module
module.exports = {
    // Models
    Account: require('./core/account.model'),
    AccountEntry: require('./core/accountEntry.model'),
    Invoice: require('./billing/invoice.model'),
    Payment: require('./payments/payment.model'),
    
    // Controllers
    accountController: require('./core/account.controller'),
    invoiceController: require('./billing/invoice.controller'),
    paymentController: require('./payments/payment.controller'),
    
    // Services
    accountService: require('./core/account.service')
};
