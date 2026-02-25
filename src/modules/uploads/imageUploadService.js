// src/services/uploads/imageUploadService.js
const { uploadFile, deleteFile } = require("./fileUploadService");
const AppError = require("../../core/utils/api/appError");

/**
 * Upload a single image
 * @param {Buffer} imageBuffer
 * @param {string} folder
 * @returns {Promise<Object>}
 */
exports.uploadImage = async (imageBuffer, folder = "images") => {
  if (!imageBuffer) throw new AppError("No image buffer provided", 400);
  return await uploadFile(imageBuffer, folder, "image");
};

/**
 * Upload multiple images concurrently
 * @param {Array<Buffer>} imageBuffers
 * @param {string} folder
 * @returns {Promise<Array<Object>>}
 */
exports.uploadMultipleImages = async (imageBuffers, folder = "images") => {
  if (!Array.isArray(imageBuffers) || !imageBuffers.length)
    throw new AppError("No image buffers provided for multiple upload", 400);

  const uploads = imageBuffers.map((buf) => uploadFile(buf, folder, "image"));
  return await Promise.all(uploads);
};

/**
 * Delete an image
 * @param {string} publicId
 * @returns {Promise<boolean>}
 */
exports.deleteImage = async (publicId) => {
  return await deleteFile(publicId);
};
