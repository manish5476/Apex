const multer = require('multer');
const AppError = require('../appError');

// Store the file in memory as a buffer
const multerStorage = multer.memoryStorage();

// Filter to allow only image files
const multerFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image')) {
        cb(null, true);
    } else {
        cb(new AppError('Not an image! Please upload only images.', 400), false);
    }
};

const upload = multer({
    storage: multerStorage,
    fileFilter: multerFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB file size limit
});

// Middleware for a single file upload with the field name 'image'
exports.uploadSingleImage = upload.single('image');