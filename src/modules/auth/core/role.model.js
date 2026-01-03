// models/roleModel.js
const mongoose = require("mongoose");
// Import VALID_TAGS from permissions config
const { VALID_TAGS } = require("../../../config/permissions");

const roleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [
                true,
                'Role name is required (e.g., "Admin", "Sales Manager")',
            ],
            trim: true,
        },
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true,
        },
        permissions: [
            {
                type: String,
                // Validate against the centralized list
                enum: {
                    values: VALID_TAGS,
                    message:
                        "Permission {VALUE} is not valid. Please check config/permissions.js",
                },
            },
        ],
        isSuperAdmin: {
            type: Boolean,
            default: false,
        },
        isDefault: {
            type: Boolean,
            default: false,
        },
        description: {
            type: String,
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true },
);

// Optional: Helper to expose valid permissions if needed elsewhere via the model
roleSchema.statics.getValidPermissions = function () {
    return VALID_TAGS;
};

// Instance method to check if role has a specific permission
roleSchema.methods.hasPermission = function (permission) {
    if (!this.permissions || !this.permissions.length) return false;

    // Check for wildcard permission
    if (this.permissions.includes("*")) return true;

    // Check for specific permission
    if (this.permissions.includes(permission)) return true;

    // Check for category wildcard (e.g., "note:*")
    const [category] = permission.split(":");
    const categoryWildcard = `${category}:*`;
    if (this.permissions.includes(categoryWildcard)) return true;

    return false;
};

// Instance method to check if role has any of the given permissions
roleSchema.methods.hasAnyPermission = function (permissions) {
    return permissions.some((perm) => this.hasPermission(perm));
};

// Instance method to check if role has all the given permissions
roleSchema.methods.hasAllPermissions = function (permissions) {
    return permissions.every((perm) => this.hasPermission(perm));
};

// Add index for better performance
roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });
roleSchema.index({ organizationId: 1, isSuperAdmin: 1 });
roleSchema.index({ organizationId: 1, isActive: 1 });

const Role = mongoose.model("Role", roleSchema);
module.exports = Role;
