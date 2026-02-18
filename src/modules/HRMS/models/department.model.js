const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  description: String,
  
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
  parentDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  
  headOfDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assistantHOD: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  costCenter: String,
  budgetCode: String,
  
  employeeCount: { type: Number, default: 0 },
  maxStrength: Number,
  
  contactEmail: String,
  contactPhone: String,
  
  location: String,
  
  isActive: { type: Boolean, default: true, index: true },
  
  // --- Hierarchy Path (for easy queries) ---
  path: { type: String, index: true }, // "/parent/child/grandchild"
  level: { type: Number, default: 0 },

  // --- Metadata ---
  metadata: {
    establishedDate: Date,
    division: String,
    region: String
  },

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true });

// --- INDEXES ---
departmentSchema.index({ organizationId: 1, code: 1 }, { unique: true });
departmentSchema.index({ organizationId: 1, name: 1 }, { unique: true });
departmentSchema.index({ path: 1 });

// --- MIDDLEWARE ---
departmentSchema.pre('save', async function(next) {
  // Generate path for hierarchy
  if (this.parentDepartment) {
    const parent = await this.constructor.findById(this.parentDepartment);
    if (parent) {
      this.path = `${parent.path}/${this._id}`;
      this.level = parent.level + 1;
    }
  } else {
    this.path = `/${this._id}`;
    this.level = 0;
  }
  next();
});

// --- METHODS ---
departmentSchema.methods.getDescendants = async function() {
  return await this.constructor.find({
    path: new RegExp(`^${this.path}`)
  });
};

module.exports = mongoose.model('Department', departmentSchema);
// const mongoose = require('mongoose');

// const departmentSchema = new mongoose.Schema({
//   name: { type: String, required: true, trim: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
//   headOfDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   isActive: { type: Boolean, default: true }
// }, { timestamps: true });

// // Prevent duplicate department names within an organization
// departmentSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// module.exports = mongoose.model('Department', departmentSchema);