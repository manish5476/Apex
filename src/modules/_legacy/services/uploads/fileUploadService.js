// src/services/uploads/fileUploadService.js
const cloudinary = require("./cloudinaryClient");
const streamifier = require("streamifier");
const AppError = require("../../../../core/utils/appError");

/**
 * Upload a file buffer to Cloudinary.
 * @param {Buffer} fileBuffer - The raw file buffer (from multer or req.file.buffer)
 * @param {string} folder - Cloudinary folder name (e.g., 'users', 'products')
 * @param {string} resourceType - 'image', 'video', 'raw', or 'auto'
 * @returns {Promise<Object>} Cloudinary upload result
 */
exports.uploadFile = (fileBuffer, folder = "uploads", resourceType = "auto") => {
  return new Promise((resolve, reject) => {
    if (!fileBuffer)
      return reject(new AppError("No file buffer provided", 400));

    const uploadStream = cloudinary.uploader.upload_stream({folder, resource_type: resourceType,},
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary upload error:", error);
          return reject(new AppError("Failed to upload file to Cloudinary", 500));
        }
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
          format: result.format,
          bytes: result.bytes,
          created_at: result.created_at,
        });
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Delete a file from Cloudinary.
 * @param {string} publicId - The Cloudinary public_id
 * @returns {Promise<boolean>} Whether deletion succeeded
 */
exports.deleteFile = async (publicId) => {
  if (!publicId) throw new AppError("No public_id provided for deletion", 400);
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === "ok";
  } catch (err) {
    console.error("❌ Cloudinary delete error:", err);
    throw new AppError("Failed to delete file from Cloudinary", 500);
  }
};
