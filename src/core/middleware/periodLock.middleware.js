const Organization = require('../../modules/organization/core/organization.model');
const AppError = require('../utils/appError');

exports.checkPeriodLock = async (req, res, next) => {
  // 1. Get Transaction Date from Body (invoiceDate, paymentDate, etc.)
  const txnDate = req.body.invoiceDate || req.body.paymentDate || req.body.purchaseDate || req.body.date;

  if (!txnDate) return next(); // If no date involved, skip

  // 2. Fetch Organization Lock Date
  const org = await Organization.findById(req.user.organizationId).select('settings.lockDate');

  if (org && org.settings && org.settings.lockDate) {
    const txnTime = new Date(txnDate).getTime();
    const lockTime = new Date(org.settings.lockDate).getTime();

    if (txnTime <= lockTime) {
      return next(new AppError(
        `PERIOD LOCKED: You cannot add/edit transactions before ${new Date(lockTime).toDateString()}. \n` +
        "-> This period has been closed for Accounting/Tax purposes.",
        403
      ));
    }
  }
  next();
};