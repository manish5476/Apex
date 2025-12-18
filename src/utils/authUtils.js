const jwt = require('jsonwebtoken');

/**
 * Signs a JWT Access Token with a minimal, secure payload.
 * @param {object} user - The user object (expecting { _id, organizationId, role })
 */
exports.signAccessToken = (user) => {
  // 1. Sanitize Payload (Prevents Circular JSON errors & Huge Tokens)
  const payload = {
    id: user._id,
    sub: user._id,
    organizationId: user.organizationId,
    // If role is an object (populated), take _id. If string, take it.
    role: user.role && user.role._id ? user.role._id : user.role 
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1h",
    }
  );
};

/**
 * Signs a Refresh Token (Long-lived)
 */
exports.signRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  });
};

/**
 * Legacy support if needed, but prefer signAccessToken
 */
exports.signToken = (user) => {
  const payload = {
    id: user._id,
    organizationId: user.organizationId,
    branchId: user.branchId,
    role: user.role, 
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};
// const jwt = require('jsonwebtoken');

// /**
//  * Signs a JWT token for a user.
//  * @param {object} user - The user object
//  * @returns {string} A signed JWT token
//  */
// exports.signToken = (user) => {
//   const payload = {
//     id: user._id,
//     organizationId: user.organizationId,
//     branchId: user.branchId,
//     role: user.role, // This will be the Role ID
//   };

//   return jwt.sign(payload, process.env.JWT_SECRET, {
//     expiresIn: process.env.JWT_EXPIRES_IN,
//   });
// };

// exports.signAccessToken = (user) => {
//   console.log(user,"😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎😎")
//   return jwt.sign(
//     {
//       id: user._id,
//       name:user.name,
//       sub: user._id, // Standard JWT subject
//       organizationId: user.organizationId, // ✅ REQUIRED for Socket
//       role: user.role
//     },
//     process.env.JWT_SECRET,
//     {
//       expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1h",
//     }
//   );
// };

// // exports.signAccessToken = (userId) => {
// //   return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
// //     expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1h",
// //   });
// // };

// exports.signRefreshToken = (userId) => {
//   return jwt.sign({ id: userId }, process.env.REFRESH_TOKEN_SECRET, {
//     expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
//   });
// };
