// controllers/paymentWebhookController.js
const catchAsync = require('../utils/catchAsync');
const emiService = require('../services/emiService');
const PendingReconciliation = require('../models/pendingReconciliationModel');

exports.paymentGatewayWebhook = catchAsync(async (req, res, next) => {
  const {
    event, // 'payment.success', 'payment.failed', etc.
    transaction_id,
    invoice_id, // Your invoice number
    amount,
    currency,
    payment_method,
    timestamp,
    customer_email,
    metadata
  } = req.body;

  // Find organization by invoice number
  const invoice = await Invoice.findOne({ 
    invoiceNumber: invoice_id 
  }).populate('organizationId');

  if (!invoice) {
    return res.status(404).json({ 
      status: 'error', 
      message: 'Invoice not found' 
    });
  }

  if (event === 'payment.success') {
    try {
      const result = await emiService.autoReconcilePayment({
        organizationId: invoice.organizationId._id,
        branchId: invoice.branchId,
        invoiceId: invoice._id,
        amount: amount / 100, // Convert from paise to rupees
        paymentDate: new Date(timestamp * 1000),
        paymentMethod: mapPaymentMethod(payment_method),
        transactionId: transaction_id,
        gateway: 'razorpay', // or 'stripe', 'paypal', etc.
        createdBy: null // System user
      });

      return res.status(200).json({
        status: 'success',
        message: 'Payment reconciled successfully',
        data: result
      });

    } catch (error) {
      // Store for manual reconciliation
      await PendingReconciliation.create({
        organizationId: invoice.organizationId._id,
        invoiceId: invoice._id,
        customerId: invoice.customerId,
        externalTransactionId: transaction_id,
        amount: amount / 100,
        paymentDate: new Date(timestamp * 1000),
        paymentMethod: mapPaymentMethod(payment_method),
        gateway: 'razorpay',
        rawData: req.body,
        status: 'pending',
        error: error.message
      });

      return res.status(200).json({
        status: 'pending',
        message: 'Payment queued for manual reconciliation',
        transaction_id
      });
    }
  }

  res.status(200).json({ status: 'acknowledged' });
});

function mapPaymentMethod(gatewayMethod) {
  const mapping = {
    'card': 'credit',
    'netbanking': 'bank',
    'upi': 'upi',
    'wallet': 'other',
    'cash': 'cash'
  };
  return mapping[gatewayMethod] || 'other';
}