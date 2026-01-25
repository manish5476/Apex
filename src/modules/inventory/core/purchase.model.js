const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, },
    name: { type: String, required: true, },
    quantity: { type: Number, required: true, min: 1, },
    purchasePrice: { type: Number, required: true, min: 0, },
    taxRate: { type: Number, default: 0, },
    discount: { type: Number, default: 0, },
}, { _id: false });
const purchaseSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true, },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true, },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true, },
    invoiceNumber: { type: String, trim: true, uppercase: true, index: true, },
    purchaseDate: { type: Date, default: Date.now, },
    dueDate: { type: Date, },
    status: { type: String, enum: ['draft', 'received', 'cancelled'], default: 'draft', },
    items: [purchaseItemSchema],
    subTotal: { type: Number, default: 0, },
    totalTax: { type: Number, default: 0, },
    totalDiscount: { type: Number, default: 0, },
    grandTotal: { type: Number, required: true, default: 0, },
    paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid', },
    paidAmount: { type: Number, default: 0, },
    balanceAmount: { type: Number, default: 0, },
    paymentMethod: { type: String, enum: ['cash', 'bank', 'credit', 'upi', 'other'], default: 'cash', },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', },
    notes: { type: String, trim: true, },
    attachedFiles: [{ type: String,trim: true, }],
    isDeleted: { type: Boolean, default: false, },
}, { timestamps: true });

purchaseSchema.index({ organizationId: 1, supplierId: 1 });
purchaseSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true, sparse: true });
purchaseSchema.index({ organizationId: 1, purchaseDate: -1 });
purchaseSchema.virtual('totalQuantity').get(function () {
    if (!this.items || this.items.length === 0) return 0;
    return this.items.reduce((acc, item) => acc + item.quantity, 0);
});
purchaseSchema.pre('save', function (next) {
    if (this.isModified('items') || this.isModified('paidAmount')) { let subTotal = 0; let totalTax = 0; let totalDiscount = 0; this.items.forEach(item => { const itemTotal = item.purchasePrice * item.quantity; subTotal += itemTotal; totalDiscount += item.discount || 0; totalTax += ((item.taxRate || 0) / 100) * (itemTotal - (item.discount || 0)) }); this.subTotal = subTotal; this.totalTax = totalTax; this.totalDiscount = totalDiscount; this.grandTotal = subTotal + totalTax - totalDiscount; this.balanceAmount = this.grandTotal - (this.paidAmount || 0); }
    next();
});
const Purchase = mongoose.model('Purchase', purchaseSchema);
module.exports = Purchase;