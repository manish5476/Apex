// src/models/branchModel.js
const mongoose = require('mongoose');

// --- Subdocument for address ---
const addressSchema = new mongoose.Schema({
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
});

// --- Main branch schema ---
const branchSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'Branch name is required (e.g., "Main Store")'], trim: true, },
    address: addressSchema,
    phoneNumber: { type: String, trim: true, },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true, },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', },
    branchCode: { type: String, trim: true, uppercase: true, },
    location: { lat: { type: Number }, lng: { type: Number }, },
    isMainBranch: { type: Boolean, default: false, },
    isActive: { type: Boolean, default: true, },
}, { timestamps: true });

// --- Auto-lowercase city/state for consistency ---
branchSchema.pre('save', function (next) {
    if (this.address?.city) this.address.city = this.address.city.toLowerCase();
    if (this.address?.state) this.address.state = this.address.state.toLowerCase();
    next();
});

const Branch = mongoose.model('Branch', branchSchema);
module.exports = Branch;
