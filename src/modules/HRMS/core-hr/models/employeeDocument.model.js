const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['not_required', 'pending', 'verified', 'rejected', 'expired'],
    default: 'pending',
    index: true,
  },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
  rejectionReason: { type: String, trim: true },
  expiresAt: Date,
}, { _id: false });

const employeeDocumentSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  employeeRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },

  documentType: {
    type: String,
    enum: ['aadhaar', 'pan', 'passport', 'driving_license', 'offer_letter', 'appointment_letter', 'nda', 'contract', 'education', 'experience', 'relieving_letter', 'policy_acknowledgement', 'other'],
    required: true,
    index: true,
  },
  documentNumber: { type: String, trim: true, select: false },
  title:          { type: String, required: true, trim: true },
  fileUrl:        { type: String, trim: true },
  assetId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },

  confidentiality: { type: String, enum: ['public', 'internal', 'confidential', 'restricted'], default: 'confidential' },
  verification: verificationSchema,

  isActive:  { type: Boolean, default: true, index: true },
  isDeleted: { type: Boolean, default: false, index: true },

  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

employeeDocumentSchema.index({ organizationId: 1, user: 1, documentType: 1, isDeleted: 1 });
employeeDocumentSchema.index({ organizationId: 1, documentType: 1, 'verification.status': 1 });
employeeDocumentSchema.index(
  { organizationId: 1, documentType: 1, documentNumber: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('EmployeeDocument', employeeDocumentSchema);
