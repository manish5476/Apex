// src/services/imageUploadService.js
const fileUploadService = require("./fileUploadService");
const AppError = require("../utils/appError");

exports.uploadImage = async (fileBuffer, folder = "images") => {
  if (!fileBuffer) throw new AppError("No image buffer provided", 400);
  // Future: image validation/resizing can be added here
  return await fileUploadService.uploadFile(fileBuffer, folder);
};

// const cloudinary = require('cloudinary').v2;
// const streamifier = require('streamifier');
// const AppError = require('../utils/appError');

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// exports.uploadImage = (fileBuffer, folder) => {
//   return new Promise((resolve, reject) => {
//     if (!fileBuffer) {
//       return reject(new AppError('No file buffer provided.', 400));
//     }

//     const uploadStream = cloudinary.uploader.upload_stream(
//       {
//         folder: folder,
//         resource_type: 'auto',
//       },
//       (error, result) => {
//         if (error) {
//           console.error('Cloudinary upload error:', error);
//           return reject(new AppError('Failed to upload image to storage.', 500));
//         }
//         if (result) {
//           resolve(result.secure_url);
//         }
//       }
//     );

//     streamifier.createReadStream(fileBuffer).pipe(uploadStream);
//   });
// };
