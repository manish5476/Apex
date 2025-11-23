const jwt = require('jsonwebtoken');

/**
 * Signs a JWT token for a user.
 * @param {object} user - The user object
 * @returns {string} A signed JWT token
 */
exports.signToken = (user) => {
  const payload = {
    id: user._id,
    organizationId: user.organizationId,
    branchId: user.branchId,
    role: user.role, // This will be the Role ID
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};


exports.signAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1h",
  });
};

exports.signRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  });
};