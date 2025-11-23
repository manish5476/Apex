// // src/models/accountModel.js
// const mongoose = require('mongoose');

// const accountSchema = new mongoose.Schema({
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   code: { type: String, required: true },           // unique code per org, e.g. 1000, 2000-1
//   name: { type: String, required: true },           // "Cash", "Accounts Receivable"
//   type: { type: String, required: true, enum: ['asset','liability','equity','income','expense','other'] },
//   parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: false }, // for hierarchy
//   balance: { type: Number, default: 0 },            // denormalized convenience (optional)
//   metadata: { type: mongoose.Schema.Types.Mixed }
// }, { timestamps: true });

// accountSchema.index({ organizationId: 1, code: 1 }, { unique: true });

// module.exports = mongoose.model('Account', accountSchema);
