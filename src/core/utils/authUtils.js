const jwt = require('jsonwebtoken');

exports.signToken = (user) => {
  const payload = {
    id: user._id,
    organizationId: user.organizationId,
    branchId: user.branchId,
    role: user.role?._id || user.role,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

exports.signAccessToken = (user) => {
  const userId = user._id || user.id;

  return jwt.sign(
    {
      id: userId, // Standardize on 'id'
      sub: userId, // 'sub' is the industry standard for Subject (User ID)
      name: user.name,
      email: user.email,
      organizationId: user.organizationId,
      isSuperAdmin: user.isSuperAdmin || user.role?.isSuperAdmin || false,
      isOwner: user.isOwner || false
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1h",
    }
  );
};

exports.signRefreshToken = (userId) => {
  // Ensure userId is a string/ID, not the whole object
  const id = userId._id || userId; 
  
  return jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  });
};

// exports.signAccessToken = (user) => {
//   console.log("🔐 Signing access token for user:", {
//     userId: user._id,
//     email: user.email,
//     roleName: user.role?.name,
//     isSuperAdmin: user.isSuperAdmin || user.role?.isSuperAdmin,
//     isOwner: user.isOwner
//   });
  
//   return jwt.sign(
//     {
//       id: user._id,
//       name: user.name,
//       email: user.email,
//       sub: user._id,
//       organizationId: user.organizationId,
//       role: user.role?._id || user.role,
//       isSuperAdmin: user.isSuperAdmin || user.role?.isSuperAdmin || false,
//       isOwner: user.isOwner || false
//     },
//     process.env.JWT_SECRET,
//     {
//       expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1h",
//     }
//   );
// };

// exports.signRefreshToken = (userId) => {
//   return jwt.sign({ id: userId }, process.env.REFRESH_TOKEN_SECRET, {
//     expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
//   });
// };

exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Optional: Add token decoding without verification
exports.decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
};