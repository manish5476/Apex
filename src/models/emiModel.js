const mongoose = require('mongoose');

const installmentSchema = new mongoose.Schema({
  installmentNumber: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  principalAmount: { type: Number, required: true },
  interestAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'overdue'],
    default: 'pending',
  },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
});

const emiSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      unique: true, // one EMI per invoice
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    totalAmount: { type: Number, required: true },
    downPayment: { type: Number, default: 0 },
    balanceAmount: { type: Number, required: true },
    numberOfInstallments: { type: Number, required: true },
    interestRate: { type: Number, default: 0 },
    emiStartDate: { type: Date, required: true },
    emiEndDate: { type: Date },
    installments: [installmentSchema],
    status: {
      type: String,
      enum: ['active', 'completed', 'defaulted'],
      default: 'active',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const EMI = mongoose.model('EMI', emiSchema);
module.exports = EMI;
