// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../../models/userModel");
const Organization = require("../../models/organizationModel");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

exports.protect = async (req, res, next) => {
    try {
        // 1) Get token from header or cookie
        let token;
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ) {
            token = req.headers.authorization.split(" ")[1];
        } else if (req.cookies && req.cookies.jwt) {
            token = req.cookies.jwt;
        }

        // 2) If no token found, return 401
        if (!token) {
            return res.status(401).json({
                status: "fail",
                message: "You are not logged in",
            });
        }

        // 3) Verify Token with promise wrapper (your existing logic)
        const decoded = await new Promise((resolve, reject) => {
            jwt.verify(token, JWT_SECRET, (err, payload) => {
                if (err) return reject(err);
                resolve(payload);
            });
        });

        // 4) Check if User still exists WITH populated role
        const currentUser = await User.findById(decoded.id).populate({
            path: "role",
            select: "permissions name isSuperAdmin",
        });

        if (!currentUser) {
            return res.status(401).json({
                status: "fail",
                message: "User no longer exists",
            });
        }

        // 5) Check if user changed password after token was issued
        if (
            currentUser.changedPasswordAfter &&
            currentUser.changedPasswordAfter(decoded.iat)
        ) {
            return res.status(401).json({
                status: "error",
                message: "User recently changed password. Please log in again",
            });
        }

        // 6) Check if user is organization owner
        let isOwner = false;
        if (currentUser.organizationId) {
            const org = await Organization.findOne({
                _id: currentUser.organizationId,
                owner: currentUser._id,
            });
            isOwner = !!org;
        }

        // 7) Attach user info to the request object with permissions
        req.user = {
            _id: currentUser._id,
            id: currentUser._id, // Keep both for compatibility
            email: currentUser.email,
            name: currentUser.name,
            organizationId: currentUser.organizationId,
            branchId: currentUser.branchId,
            role: currentUser.role?._id, // Keep role ID
            roleName: currentUser.role?.name,
            // Add permissions from role (owner gets wildcard)
            permissions: isOwner ? ["*"] : currentUser.role?.permissions || [],
            isOwner: isOwner,
            isSuperAdmin: isOwner
                ? true
                : currentUser.role?.isSuperAdmin || false,
        };

        // 8) Also attach the full user document for any controllers that need it
        req.userDoc = currentUser;

        next();
    } catch (err) {
        console.error("Auth Error:", err.message);

        // SPECIFIC ERROR HANDLING FOR EXPIRATION (your existing logic)
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({
                status: "fail",
                message: "jwt expired", // Frontend looks for this specific string
                code: "TOKEN_EXPIRED", // Optional: specific code for frontend logic
            });
        }

        // GENERIC ERROR HANDLING
        return res.status(401).json({
            status: "fail",
            message: "Invalid token",
        });
    }
};

// Optional: Add a middleware to restrict access to owners only
exports.restrictToOwner = async (req, res, next) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                status: "error",
                message: "Authentication required",
            });
        }

        if (!req.user.isOwner) {
            return res.status(403).json({
                status: "error",
                message: "Only organization owner can perform this action",
            });
        }

        next();
    } catch (error) {
        console.error("Owner restriction error:", error);
        return res.status(500).json({
            status: "error",
            message: "Authorization check failed",
        });
    }
};

// Optional: Add a middleware to restrict access to super admins (owners or users with super admin role)
exports.restrictToSuperAdmin = async (req, res, next) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                status: "error",
                message: "Authentication required",
            });
        }

        if (!req.user.isOwner && !req.user.isSuperAdmin) {
            return res.status(403).json({
                status: "error",
                message: "Only super administrators can perform this action",
            });
        }

        next();
    } catch (error) {
        console.error("Super admin restriction error:", error);
        return res.status(500).json({
            status: "error",
            message: "Authorization check failed",
        });
    }
};
// const express = require('express');
// const router = express.Router();
// const roleController = require('../../controllers/roleControllers');
// const authController = require('../../controllers/authController');
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// // Metadata for Frontend UI (Checkbox generation)
// router.get('/permissions-metadata', (req, res) => {
//     const { PERMISSIONS_LIST } = require("../../config/permissions");
//     res.json({ status: 'success', data: PERMISSIONS_LIST });
// });

// router.get('/', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.getRoles);
// router.post('/', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.createRole);
// router.patch('/:id', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.updateRole);
// router.delete('/:id', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.deleteRole);

// module.exports = router;
