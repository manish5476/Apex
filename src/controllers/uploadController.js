const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { uploadImage } = require('../services/imageUploadService');

/**
 * @desc    Uploads a single image to the cloud storage.
 * @route   POST /api/v1/uploads/image
 * @access  Private (requires authentication)
 */
exports.uploadImageHandler = catchAsync(async (req, res, next) => {
    if (!req.file) {
        return next(new AppError('Please upload a file.', 400));
    }
    // The 'uploads' string is the folder name in Cloudinary
    const imageUrl = await uploadImage(req.file.buffer, 'uploads');
    res.status(201).json({
        status: 'success',
        message: 'Image uploaded successfully',
        data: {
            imageUrl: imageUrl,
        },
    });
});