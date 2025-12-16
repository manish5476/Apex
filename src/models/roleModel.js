const mongoose = require('mongoose');
// Import the "Source of Truth" from your config
// This ensures the model validates against the same tags used in the frontend/routes
const { VALID_TAGS } = require('../config/permissions');

const roleSchema = new mongoose.Schema({
name: {
    type: String,
    required: [true, 'Role name is required (e.g., "Admin", "Sales Manager")'],
    trim: true,
},
organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
},
permissions: [{
    type: String,
    // Validate against the centralized list
    enum: {
        values: VALID_TAGS,
        message: 'Permission {VALUE} is not valid. Please check config/permissions.js'
    }
}],
isSuperAdmin: {
    type: Boolean,
    default: false, 
},
isDefault: {
    type: Boolean,
    default: false, 
}
}, { timestamps: true });

// Optional: Helper to expose valid permissions if needed elsewhere via the model
roleSchema.statics.getValidPermissions = function () {
return VALID_TAGS;
};

const Role = mongoose.model('Role', roleSchema);
module.exports = Role;

