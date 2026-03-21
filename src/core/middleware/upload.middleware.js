// src/middleware/uploadMiddleware.js
const multer = require("multer");
const AppError = require("../utils/api/appError");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) cb(null, true);
  else cb(new AppError("Only image uploads are allowed", 400), false);
};

exports.upload = multer({ storage, fileFilter });
