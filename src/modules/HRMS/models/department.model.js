const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  code:        { type: String, required: false, trim: true, uppercase: true },
  description: String,

  organizationId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  parentDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  headOfDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assistantHOD:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  costCenter:  String,
  budgetCode:  String,

  // FIX BUG-DE-03 [MEDIUM] — employeeCount is denormalized.
  // It is NOT a live count — it must be updated by User post-save/delete hooks.
  // Do NOT query this for reporting; use User.countDocuments({ departmentId }) instead.
  employeeCount: { type: Number, default: 0 },
  maxStrength:   Number,

  contactEmail: String,
  contactPhone: String,
  location:     String,

  isActive: { type: Boolean, default: true, index: true },

  // --- Hierarchy Path ---
  // Materialized path: "/rootId/childId/grandChildId"
  // Used for efficient ancestor/descendant queries without recursive lookups.
  path:  { type: String },
  level: { type: Number, default: 0 },

  metadata: {
    establishedDate: Date,
    division:        String,
    region:          String,
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
departmentSchema.index({ organizationId: 1, code: 1 }, { unique: true, sparse: true }); // sparse: code is optional
departmentSchema.index({ organizationId: 1, name: 1 }, { unique: true });
departmentSchema.index({ path: 1 });

// ─────────────────────────────────────────────
//  Pre-Validate
// ─────────────────────────────────────────────

// FIX BUG-DE-04 [MEDIUM] — Guard against self-referencing parent
departmentSchema.pre('validate', function (next) {
  if (
    this.parentDepartment &&
    this._id &&
    this.parentDepartment.toString() === this._id.toString()
  ) {
    return next(new Error('A department cannot reference itself as its parent'));
  }
  next();
});

// ─────────────────────────────────────────────
//  Pre-Save Middleware
// ─────────────────────────────────────────────

departmentSchema.pre('save', async function (next) {
  try {
    if (this.isModified('parentDepartment')) {
      if (this.parentDepartment) {
        const parent = await this.constructor.findById(this.parentDepartment).lean();
        if (!parent) {
          return next(new Error(`Parent department ${this.parentDepartment} not found`));
        }
        this.path  = `${parent.path}/${this._id}`;
        this.level = parent.level + 1;
      } else {
        this.path  = `/${this._id}`;
        this.level = 0;
      }

      // FIX BUG-DE-01 [CRITICAL] — Cascade path update to all descendants.
      // Original only updated THIS document's path. All child/grandchild departments
      // retained their old path, making getDescendants() return wrong results.
      // We must update all documents whose path starts with the OLD path of this document.
      if (!this.isNew) {
        const oldDoc = await this.constructor.findById(this._id).lean();
        if (oldDoc && oldDoc.path) {
          const oldPath = oldDoc.path;
          const newPath = this.path;

          // Find all descendants (their path starts with the old path of this node)
          const descendants = await this.constructor.find({
            path: new RegExp(`^${escapeRegex(oldPath)}/`),
          }).lean();

          if (descendants.length > 0) {
            const bulkOps = descendants.map((desc) => ({
              updateOne: {
                filter: { _id: desc._id },
                update: {
                  $set: {
                    path: desc.path.replace(oldPath, newPath),
                    // Recalculate level based on new path depth
                    level: (desc.path.replace(oldPath, newPath).match(/\//g) || []).length - 1,
                  },
                },
              },
            }));
            await this.constructor.bulkWrite(bulkOps);
          }
        }
      }
    } else if (this.isNew) {
      // New root department
      if (!this.parentDepartment) {
        this.path  = `/${this._id}`;
        this.level = 0;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * FIX BUG-DE-02 [HIGH] — Escape regex metacharacters in path strings.
 * Without escaping, a malformed path containing `.`, `*`, `+`, etc.
 * would cause incorrect regex matches or throw a regex syntax error.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────
//  Methods
// ─────────────────────────────────────────────

/**
 * FIX BUG-DE-02 [HIGH] — getDescendants now uses escapeRegex to prevent
 * regex injection from malformed path values.
 */
departmentSchema.methods.getDescendants = async function () {
  return await this.constructor.find({
    path: new RegExp(`^${escapeRegex(this.path)}/`),
  });
};

/**
 * Get direct children only (one level down)
 */
departmentSchema.methods.getDirectChildren = async function () {
  return await this.constructor.find({ parentDepartment: this._id });
};

/**
 * Get full ancestor chain (from root to this node)
 */
departmentSchema.methods.getAncestors = async function () {
  const ids = this.path
    .split('/')
    .filter(Boolean)
    .slice(0, -1) // Exclude self
    .map((id) => new mongoose.Types.ObjectId(id));

  return await this.constructor.find({ _id: { $in: ids } });
};

module.exports = mongoose.model('Department', departmentSchema);
// const mongoose = require('mongoose');

// const departmentSchema = new mongoose.Schema({
//   name: { type: String, required: true, trim: true },
//   code: { type: String, required: false, trim: true, uppercase: true },
//   description: String,
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
//   parentDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
//   headOfDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   assistantHOD: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   costCenter: String,
//   budgetCode: String,
//   employeeCount: { type: Number, default: 0 },
//   maxStrength: Number,
//   contactEmail: String,
//   contactPhone: String,
//   location: String,
//   isActive: { type: Boolean, default: true, index:   true },
//   // --- Hierarchy Path (for easy queries) ---
//   path: { type: String, index: true }, // "/parent/child/grandchild"
//   level: { type: Number, default: 0 },

//   // --- Metadata ---
//   metadata: {
//     establishedDate: Date,
//     division: String,
//     region: String
//   },

//   // --- Audit ---
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

// }, { timestamps: true });

// // --- INDEXES ---
// departmentSchema.index({ organizationId: 1, code: 1 }, { unique: true });
// departmentSchema.index({ organizationId: 1, name: 1 }, { unique: true });
// departmentSchema.index({ path: 1 });

// // --- MIDDLEWARE ---
// departmentSchema.pre('save', async function(next) {
//   // Generate path for hierarchy
//   if (this.parentDepartment) {
//     const parent = await this.constructor.findById(this.parentDepartment);
//     if (parent) {
//       this.path = `${parent.path}/${this._id}`;
//       this.level = parent.level + 1;
//     }
//   } else {
//     this.path = `/${this._id}`;
//     this.level = 0;
//   }
//   next();
// });

// // --- METHODS ---
// departmentSchema.methods.getDescendants = async function() {
//   return await this.constructor.find({
//     path: new RegExp(`^${this.path}`)
//   });
// };

// module.exports = mongoose.model('Department', departmentSchema);
