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

  token: { type: String, required: true, index: true }, // stored token (JWT)
  isValid: { type: Boolean, default: true }, // admin or system can invalidate

  loggedInAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },
}, { timestamps: true });

// quick TTL cleanup optional — keep for audit (comment out if not desired)
// sessionSchema.index({ lastActivityAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // auto-delete after 90 days

module.exports = mongoose.model("Session", sessionSchema);


// const mongoose = require("mongoose");

// const sessionSchema = new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },

//   // Device metadata
//   device: { type: String },
//   browser: { type: String },
//   os: { type: String },

//   ipAddress: { type: String },
//   location: { type: String }, // optional (geo)

//   token: { type: String, required: true }, // JWT / session token
//   isValid: { type: Boolean, default: true }, // admin can invalidate

//   loggedInAt: { type: Date, default: Date.now },
//   lastActivityAt: { type: Date, default: Date.now },

// }, { timestamps: true });

// module.exports = mongoose.model("Session", sessionSchema);
