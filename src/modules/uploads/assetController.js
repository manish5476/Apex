const Asset = require('./asset.model'); // Adjust path to your Asset model
const imageUploadService = require('./imageUploadService');
const catchAsync = require('../../core/utils/api/catchAsync');
const AppError = require("../../core/utils/api/appError");

/* ===================================================
   🖼️ GET ALL MEDIA (Gallery View with Pagination)
==================================================== */
exports.getAllAssets = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, search, category, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
  const skip = (page - 1) * limit;

  // 1. Build Query for this Organization
  let query = { organizationId: req.user.organizationId };

  // 2. Apply Filters
  if (category) {
    query.category = category;
  }
  
  if (search) {
    query.fileName = { $regex: search, $options: 'i' };
  }

  // 3. Determine Sort Order
  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  // 4. Fetch Data and Total Count Concurrently
  const [assets, total] = await Promise.all([
    Asset.find(query)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .populate('uploadedBy', 'name email'), // Know exactly who uploaded it
    Asset.countDocuments(query)
  ]);

  res.status(200).json({
    status: 'success',
    results: assets.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: Number(page),
    data: { assets }
  });
});

/* ===================================================
   📊 GET STORAGE STATISTICS (For Admin Dashboard)
==================================================== */
exports.getStorageStats = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;

  // Aggregate to get grand total AND breakdown by category
  const stats = await Asset.aggregate([
    { $match: { organizationId: orgId } },
    {
      $facet: {
        // Grand Totals
        overall: [
          {
            $group: {
              _id: null,
              totalBytes: { $sum: "$size" },
              totalFiles: { $sum: 1 }
            }
          }
        ],
        // Breakdown by Category (e.g., 'product': 50MB, 'kyc': 120MB)
        byCategory: [
          {
            $group: {
              _id: "$category",
              bytes: { $sum: "$size" },
              count: { $sum: 1 }
            }
          },
          { $sort: { bytes: -1 } }
        ]
      }
    }
  ]);

  // Format response gracefully if no assets exist yet
  const overallStats = stats[0].overall[0] || { totalBytes: 0, totalFiles: 0 };
  const categoryStats = stats[0].byCategory || [];

  res.status(200).json({
    status: 'success',
    data: {
      totalBytes: overallStats.totalBytes,
      totalFiles: overallStats.totalFiles,
      // Convert bytes to MB for easy frontend display
      totalMB: (overallStats.totalBytes / (1024 * 1024)).toFixed(2),
      breakdown: categoryStats.map(cat => ({
        category: cat._id,
        count: cat.count,
        bytes: cat.bytes,
        mb: (cat.bytes / (1024 * 1024)).toFixed(2)
      }))
    }
  });
});

/* ===================================================
   🗑️ DELETE ASSET DIRECTLY FROM GALLERY
==================================================== */
exports.deleteAsset = catchAsync(async (req, res, next) => {
  await imageUploadService.deleteFullAsset(req.params.id, req.user.organizationId);
  res.status(200).json({
    status: 'success',
    message: 'Asset permanently removed from Cloudinary and Database.'
  });
});
