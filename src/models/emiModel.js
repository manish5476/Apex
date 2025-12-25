const mongoose = require('mongoose');

const installmentSchema = new mongoose.Schema({
  installmentNumber: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  
  // Financials
  principalAmount: { type: Number, required: true },
  interestAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  
  // Status
  paidAmount: { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'overdue'],
    default: 'pending',
  },
  
  // Link to the actual financial transaction
  paymentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Payment', 
      default: null 
  }
});

const emiSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    
    // Linking
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },

    // Plan Details
    totalAmount: { type: Number, required: true }, // Grand Total (incl Interest)
    downPayment: { type: Number, default: 0 },
    balanceAmount: { type: Number, required: true }, // Amount to be paid via installments
    
    numberOfInstallments: { type: Number, required: true },
    interestRate: { type: Number, default: 0 }, // Annual %
    
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

// Indexes for fast lookup
emiSchema.index({ organizationId: 1, invoiceId: 1 });
emiSchema.index({ organizationId: 1, customerId: 1 });
emiSchema.index({ organizationId: 1, status: 1 });

const EMI = mongoose.model('EMI', emiSchema);
module.exports = EMI;

// const mongoose = require('mongoose');

// const installmentSchema = new mongoose.Schema({
//   installmentNumber: { type: Number, required: true },
//   dueDate: { type: Date, required: true },
//   principalAmount: { type: Number, required: true },
//   interestAmount: { type: Number, default: 0 },
//   totalAmount: { type: Number, required: true },
//   paidAmount: { type: Number, default: 0 },
//   paymentStatus: {
//     type: String,
//     enum: ['pending', 'partial', 'paid', 'overdue'],
//     default: 'pending',
//   },
//   paymentId: { 
//       type: mongoose.Schema.Types.ObjectId, 
//       ref: 'Payment', 
//       default: null 
//   },
//   // paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
// });

// const emiSchema = new mongoose.Schema(
//   {
//     organizationId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Organization',
//       required: true,
//       index: true,
//     },
//     branchId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Branch',
//       required: true,
//     },
//     invoiceId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Invoice',
//       required: true,
//       unique: true, // one EMI per invoice
//     },
//     customerId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Customer',
//       required: true,
//     },
//     totalAmount: { type: Number, required: true },
//     downPayment: { type: Number, default: 0 },
//     balanceAmount: { type: Number, required: true },
//     numberOfInstallments: { type: Number, required: true },
//     interestRate: { type: Number, default: 0 },
//     emiStartDate: { type: Date, required: true },
//     emiEndDate: { type: Date },
//     installments: [installmentSchema],
//     status: {
//       type: String,
//       enum: ['active', 'completed', 'defaulted'],
//       default: 'active',
//     },
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   },
//   { timestamps: true }
// );

// const EMI = mongoose.model('EMI', emiSchema);
// module.exports = EMI;
