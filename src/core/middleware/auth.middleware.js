const jwt = require("jsonwebtoken");
const User = require("../../modules/auth/core/user.model");
const Organization = require("../../modules/organization/core/organization.model");

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return "change_this_secret";
};

exports.protect = async (req, res, next) => {
  try {
    // 1. Extract token
    const token =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : req.cookies?.jwt;

    if (!token) {
      return res.status(401).json({ status: "fail", message: "You are not logged in" });
    }

    // 2. Verify token
    const decoded = await new Promise((resolve, reject) =>
      jwt.verify(token, getJwtSecret(), (err, payload) =>
        err ? reject(err) : resolve(payload)
      )
    );
    if (decoded.type && decoded.type !== "merchant_user") {
      return res.status(403).json({ status: "fail", message: "Invalid token type for merchant API" });
    }

    // 3. ✅ Parallel DB hit — User + Org in one round-trip instead of two sequential
    const [currentUser, ownerOrg] = await Promise.all([
      User.findById(decoded.id).populate({
        path: "role",
        select: "permissions name isSuperAdmin",
      }),
      Organization.findOne({ owner: decoded.id }).select("_id").lean(),
    ]);

    if (!currentUser) {
      return res.status(401).json({ status: "fail", message: "User no longer exists" });
    }

    if (currentUser.changedPasswordAfter?.(decoded.iat)) {
      return res.status(401).json({
        status: "fail",
        message: "Password recently changed. Please log in again",
      });
    }

    const isOwner = !!ownerOrg;

    // 4. Attach resolved identity — ONE place, ONE time
    //    Everything downstream reads from req.user; no more DB calls for authz.
    req.user = {
      _id: currentUser._id,
      id: currentUser._id,
      email: currentUser.email,
      name: currentUser.name,
      organizationId: currentUser.organizationId,
      branchId: currentUser.branchId,
      role: currentUser.role?._id,
      roleName: currentUser.role?.name,
      isOwner,
      // isOwner gets wildcard; isSuperAdmin inherits from role
      isSuperAdmin: isOwner || currentUser.role?.isSuperAdmin || false,
      // isOwner → ["*"] (all access), otherwise role permissions array
      permissions: isOwner ? ["*"] : (currentUser.role?.permissions ?? []),
    };

    req.userDoc = currentUser; // raw doc for controllers that need it

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ status: "fail", message: "jwt expired", code: "TOKEN_EXPIRED" });
    }
    console.error("Auth error:", err.message);
    return res.status(401).json({ status: "fail", message: "Invalid token" });
  }
};

// Convenience guards — use in routes when you only need ownership/admin, not a specific permission
exports.restrictToOwner = (req, res, next) => {
  if (!req.user.isOwner) {
    return res.status(403).json({ status: "error", message: "Only organization owners can do this" });
  }
  next();
};

exports.restrictToSuperAdmin = (req, res, next) => {
  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    return res.status(403).json({ status: "error", message: "Only super administrators can do this" });
  }
  next();
};

