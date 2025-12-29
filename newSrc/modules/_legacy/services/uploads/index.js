// src/services/uploads/index.js
const { uploadFile, deleteFile } = require("./fileUploadService");
const {
  uploadImage,
  uploadMultipleImages,
  deleteImage,
} = require("./imageUploadService");

module.exports = {
  uploadFile,
  deleteFile,
  uploadImage,
  uploadMultipleImages,
  deleteImage,
};
