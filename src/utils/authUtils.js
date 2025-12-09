const jwt = require('jsonwebtoken');

/**
 * Signs a JWT Access Token.
 * CRITICAL FIX: Accepts full user object to include organizationId for Socket.io
 * @param {object|string} user - The user object (or ID as fallback)
 * @returns {string} A signed JWT token
 */
exports.signAccessToken = (user) => {
  // 1. Handle if 'user' is just an ID string (backward compatibility)
  // or a full object (what we need).
  const userId = user._id || user.id || user;
  
  // 2. Extract Organization ID (Critical for Chat/Socket)
  const organizationId = user.organizationId || null;

  // 3. Construct Payload
  const payload = {
    id: userId,            // Legacy ID
    sub: userId,           // Standard "Subject" claim
    organizationId: organizationId // <--- REQUIRED BY SOCKET MIDDLEWARE
  };

  // 4. Sign Token
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1h",
  });
};

exports.signRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  });
};

// You can keep this if you use it elsewhere, but signAccessToken above now does the same job.
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


// exports.signAccessToken = (userId) => {
//   return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
//     expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1h",
//   });
// };

// exports.signRefreshToken = (userId) => {
//   return jwt.sign({ id: userId }, process.env.REFRESH_TOKEN_SECRET, {
//     expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
//   });
// };
