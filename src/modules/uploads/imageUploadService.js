const Asset = require('./asset.model');
const { uploadFile, deleteFile } = require("./fileUploadService");
const AppError = require("../../core/utils/api/appError");

/**
 * Uploads a single image, records it in DB, and returns the Asset document.
 * @param {Object} file - The multer file object (req.file)
 * @param {Object} user - The req.user object for auditing
 * @param {string} category - 'avatar', 'product', 'marketing', etc.
 */
exports.uploadAndRecord = async (file, user, category = 'marketing') => {
  if (!file || !file.buffer) {
    throw new AppError("No file provided for upload.", 400);
  }

  // Define folder structure: orgId/category/filename
  const folder = `shivam_electronics/${user.organizationId}/${category}`;

  // 1. Upload to Cloudinary
  const cloudResult = await uploadFile(file.buffer, folder, "image");

  // 2. Create Database Record
  const asset = await Asset.create({
    organizationId: user.organizationId,
    uploadedBy: user._id,
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: cloudResult.bytes,
    publicId: cloudResult.public_id,
    url: cloudResult.url,
    category,
    provider: 'cloudinary' // Ready for 'local' switch in the future
  });

  return asset;
};

/**
 * Uploads multiple images concurrently and records them all.
 * @param {Array} files - Array of multer files (req.files)
 */
exports.uploadMultipleAndRecord = async (files, user, category = 'product') => {
  if (!Array.isArray(files) || files.length === 0) {
    throw new AppError("No files provided for multiple upload.", 400);
  }

  // Use Promise.all to upload everything in parallel for speed
  const uploadPromises = files.map(file => this.uploadAndRecord(file, user, category));
  return await Promise.all(uploadPromises);
};

/**
 * The "Master Delete": Cleans up both Cloudinary and MongoDB.
 */
exports.deleteFullAsset = async (assetId, orgId) => {
  const asset = await Asset.findOne({ _id: assetId, organizationId: orgId });
  if (!asset) throw new AppError("Asset not found or unauthorized.", 404);

  // 1. Delete from Cloudinary
  const cloudDeleted = await deleteFile(asset.publicId);

  // 2. Delete from Database
  if (cloudDeleted) {
    await asset.deleteOne();
  } else {
    // If Cloudinary fails, we keep the DB record to avoid "Orphan Files" in the cloud
    throw new AppError("Failed to delete from Cloud storage. Database record preserved.", 500);
  }

  return true;
};
