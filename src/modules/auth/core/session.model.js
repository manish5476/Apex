const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  // device/browser info
  device: { type: String, default: "Unknown" },
  browser: { type: String, default: "Unknown" },
  os: { type: String, default: "Unknown" },

  ipAddress: { type: String, default: null },
  userAgent: { type: String, default: null },

  token: { type: String, required: true, index: true }, // current JWT
  previousToken: { type: String, default: null, index: true }, // NEW: store previous token for grace period
  refreshToken: { type: String, index: true }, // stored refresh token
  isValid: { type: Boolean, default: true }, // admin or system can invalidate

  lastTokenUpdateAt: { type: Date, default: Date.now }, // NEW: track when token was rotated
  loggedInAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("Session", sessionSchema);

