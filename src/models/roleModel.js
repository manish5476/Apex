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


// const mongoose = require('mongoose');

// // This is the list of all possible permissions in your system.
// // We keep it in one place so it's easy to manage.
// const allPermissions = [
//     // User Permissions
//     'read_users', 'create_users', 'update_users', 'delete_users',    // Product Permissions
//     'read_products', 'create_products', 'update_products', 'delete_products',    // Customer Permissions
//     'read_customers', 'create_customers', 'update_customers', 'delete_customers',    // Invoice Permissions
//     'read_invoices', 'create_invoices', 'update_invoices', 'delete_invoices',    // Purchase Permissions
//     'read_purchases', 'create_purchases',    // Branch Permissions
//     'read_branches', 'create_branches', 'update_branches',    // Role & Permission Management
//     'read_roles', 'create_roles', 'update_roles', 'delete_roles'
// ];

// const roleSchema = new mongoose.Schema({
//     name: {
//         type: String,
//         required: [true, 'Role name is required (e.g., "Admin", "Employee")'],
//         trim: true,
//     },
//     organizationId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Organization',
//         required: true,
//         index: true,
//     },
//     permissions: [{
//         type: String,
//         enum: allPermissions, // Ensures only valid permissions are used
//     }],
//     isSuperAdmin: {
//         type: Boolean,
//         default: false, // Only one role (the first) should have this
//     },
//     isDefault: {
//         type: Boolean,
//         default: false, // Is this a default role like "Employee"?
//     }
// }, { timestamps: true });

// // Helper to export the permissions list for use in controllers
// roleSchema.statics.allPermissions = allPermissions;

// const Role = mongoose.model('Role', roleSchema);
// module.exports = Role;