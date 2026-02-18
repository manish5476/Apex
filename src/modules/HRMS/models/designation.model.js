const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  description: String,
  
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // --- Hierarchy ---
  level: { type: Number, required: true, default: 1 },
  grade: { 
    type: String, 
    enum: ['A', 'B', 'C', 'D', 'E', 'F'],
    default: 'C'
  },
  
  // --- Career Path ---
  nextDesignation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
  promotionAfterYears: Number,
  
  // --- Job Details ---
  jobFamily: String, // Technical, Managerial, Support
  responsibilities: [String],
  qualifications: [String],
  experienceRequired: Number, // in years
  
  // --- Compensation Bands ---
  salaryBand: {
    min: Number,
    max: Number,
    currency: { type: String, default: 'INR' }
  },

  // --- Reporting ---
  reportsTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],
  
  isActive: { type: Boolean, default: true, index: true },
  
  // --- Metadata ---
  metadata: {
    isManager: { type: Boolean, default: false },
    isExecutive: { type: Boolean, default: false },
    requiresApproval: { type: Boolean, default: false }
  },

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true });

// --- INDEXES ---
designationSchema.index({ organizationId: 1, code: 1 }, { unique: true });
designationSchema.index({ organizationId: 1, title: 1 }, { unique: true });
designationSchema.index({ level: 1, grade: 1 });

// --- VIRTUALS ---
designationSchema.virtual('fullTitle').get(function() {
  return `${this.title} (${this.code})`;
});

module.exports = mongoose.model('Designation', designationSchema);
// const mongoose = require('mongoose');

// const designationSchema = new mongoose.Schema({
//   title: { type: String, required: true, trim: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   level: { type: Number, default: 1 }, // Hierarchy level
//   isActive: { type: Boolean, default: true }
// }, { timestamps: true });

// designationSchema.index({ organizationId: 1, title: 1 }, { unique: true });

// module.exports = mongoose.model('Designation', designationSchema);