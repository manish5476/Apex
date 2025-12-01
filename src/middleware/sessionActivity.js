// src/middleware/sessionActivity.js
const Session = require("../models/sessionModel"); // <--- Fixed "const"
const catchAsync = require("../utils/catchAsync");

exports.updateSessionActivity = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

  const token = authHeader.split(" ")[1];

  // update lastActivityAt if session exists
  await Session.findOneAndUpdate(
    { token, isValid: true }, 
    { $set: { lastActivityAt: new Date() } }
  ).lean();
  
  next();
});

