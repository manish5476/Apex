const jwt = require('jsonwebtoken');

// 1. SIGN ACCESS TOKEN (Short-lived, e.g., 1 hour)
exports.signAccessToken = (user) => {
  // Handle if 'user' is a Mongoose doc or a plain object
  const userId = user._id || user.id;

  const payload = {
    id: userId,
    sub: userId, // Standard Subject claim
    organizationId: user.organizationId,
    // Safely handle optional fields (prevents 'undefined' in token)
    ...(user.name && { name: user.name }),
    ...(user.email && { email: user.email }),
    isSuperAdmin: user.isSuperAdmin || false,
    isOwner: user.isOwner || false
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1h",
  });
};

// 2. SIGN REFRESH TOKEN (Long-lived, e.g., 30 days)
exports.signRefreshToken = (input) => {
  // 🟢 FIX: Handle the input format { id: '...' } coming from controller
  let id;
  if (typeof input === 'string') {
    id = input;
  } else if (input._id) {
    id = input._id; // Mongoose Document
  } else if (input.id) {
    id = input.id; // Plain object { id: ... }
  } else {
    throw new Error("Invalid user ID for Refresh Token");
  }
  
  return jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  });
};

// 3. VERIFY TOKEN (Used in Middleware)
exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null; // Returns null if expired or invalid
  }
};

// 4. VERIFY REFRESH TOKEN (Used in refresh-token endpoint)
exports.verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
  } catch (error) {
    return null;
  }
};

// Optional: Decode without verifying
exports.decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
};

// const jwt = require('jsonwebtoken');

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

// exports.signAccessToken = (user) => {
//   const userId = user._id || user.id;

//   return jwt.sign(
//     {
//       id: userId, // Standardize on 'id'
//       sub: userId, // 'sub' is the industry standard for Subject (User ID)
//       name: user.name,
//       email: user.email,
//       organizationId: user.organizationId,
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
//   // Ensure userId is a string/ID, not the whole object
//   const id = userId._id || userId; 
  
//   return jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, {
//     expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
//   });
// };


// exports.verifyToken = (token) => {
//   try {
//     return jwt.verify(token, process.env.JWT_SECRET);
//   } catch (error) {
//     return null;
//   }
// };

// // Optional: Add token decoding without verification
// exports.decodeToken = (token) => {
//   try {
//     return jwt.decode(token);
//   } catch (error) {
//     return null;
//   }
// };