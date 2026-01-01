const mongoose = require('mongoose');

const stockTransferSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  fromBranchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  toBranchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  reason: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'completed'
  },
  transferDate: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Indexes
stockTransferSchema.index({ organizationId: 1, transferDate: -1 });
stockTransferSchema.index({ organizationId: 1, productId: 1 });
stockTransferSchema.index({ organizationId: 1, fromBranchId: 1 });
stockTransferSchema.index({ organizationId: 1, toBranchId: 1 });

const StockTransfer = mongoose.model('StockTransfer', stockTransferSchema);
module.exports = StockTransfer;