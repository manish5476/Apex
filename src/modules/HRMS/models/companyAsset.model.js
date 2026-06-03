const mongoose = require('mongoose');

const companyAssetSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

  assetCode:    { type: String, required: true, trim: true, uppercase: true },
  name:         { type: String, required: true, trim: true },
  category:     { type: String, enum: ['laptop', 'mobile', 'tablet', 'vehicle', 'tool', 'access_card', 'furniture', 'other'], required: true, index: true },
  serialNumber: { type: String, trim: true },
  manufacturer: { type: String, trim: true },
  model:        { type: String, trim: true },

  purchaseDate: Date,
  purchaseCost: { type: Number, min: 0 },
  warrantyExpiresAt: Date,
  condition: { type: String, enum: ['new', 'good', 'fair', 'repair_needed', 'damaged', 'lost'], default: 'good' },
  status:    { type: String, enum: ['available', 'assigned', 'in_repair', 'retired', 'lost'], default: 'available', index: true },

  assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  employeeRef:  { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
  assignedAt:   Date,
  returnedAt:   Date,
  assignmentHistory: [{
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    employeeRef:{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    assignedAt: Date,
    returnedAt: Date,
    conditionOnIssue:  String,
    conditionOnReturn: String,
    notes: String,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],

  documents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

companyAssetSchema.index({ organizationId: 1, assetCode: 1 }, { unique: true });
companyAssetSchema.index({ organizationId: 1, serialNumber: 1 }, { unique: true, sparse: true });
companyAssetSchema.index({ organizationId: 1, branchId: 1, status: 1 });
companyAssetSchema.index({ organizationId: 1, assignedTo: 1, status: 1 });

companyAssetSchema.virtual('isAssigned').get(function () {
  return this.status === 'assigned' && !!this.assignedTo;
});

companyAssetSchema.methods.assignTo = async function (userId, employeeId, processedBy, notes) {
  if (this.status !== 'available') {
    throw new Error(`Asset cannot be assigned while status is '${this.status}'`);
  }

  this.assignedTo = userId;
  this.employeeRef = employeeId;
  this.assignedAt = new Date();
  this.returnedAt = undefined;
  this.status = 'assigned';
  this.assignmentHistory.push({
    user: userId,
    employeeRef: employeeId,
    assignedAt: this.assignedAt,
    conditionOnIssue: this.condition,
    notes,
    processedBy,
  });
  this.updatedBy = processedBy;
  return this.save();
};

companyAssetSchema.methods.markReturned = async function (processedBy, conditionOnReturn, notes) {
  if (this.status !== 'assigned') {
    throw new Error(`Asset cannot be returned while status is '${this.status}'`);
  }

  const returnedAt = new Date();
  const lastAssignment = this.assignmentHistory[this.assignmentHistory.length - 1];
  if (lastAssignment && !lastAssignment.returnedAt) {
    lastAssignment.returnedAt = returnedAt;
    lastAssignment.conditionOnReturn = conditionOnReturn;
    lastAssignment.notes = notes || lastAssignment.notes;
    lastAssignment.processedBy = processedBy;
  }

  this.assignedTo = undefined;
  this.employeeRef = undefined;
  this.returnedAt = returnedAt;
  this.status = 'available';
  this.condition = conditionOnReturn || this.condition;
  this.updatedBy = processedBy;
  return this.save();
};

module.exports = mongoose.model('CompanyAsset', companyAssetSchema);
