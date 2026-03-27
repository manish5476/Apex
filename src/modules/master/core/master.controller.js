const Master = require("./model/master.model");
const catchAsync = require("../../../core/utils/api/catchAsync");
const AppError = require("../../../core/utils/api/appError");

/**
 * @desc Create new master item (category, brand, etc.)
 */
exports.createMaster = catchAsync(async (req, res, next) => {
  const { type, name, code, description, isActive } = req.body;
  if (!type || !name) return next(new AppError("Type and name are required", 400));

  const newMaster = await Master.create({
    organizationId: req.user.organizationId,
    type: type.toLowerCase(),
    name: name.trim(),
    code,
    description,
    isActive: isActive ?? true,
    createdBy: req.user._id,
  });

  res.status(201).json({
    status: "success",
    data: { master: newMaster },
  });
});

/**
 * @desc Get all masters (optionally by type)
 */
exports.getMasters = catchAsync(async (req, res, next) => {
  const filter = { organizationId: req.user.organizationId };
  if (req.query.type) filter.type = req.query.type.toLowerCase();

  const masters = await Master.find(filter).sort("-createdAt");

  res.status(200).json({
    status: "success",
    results: masters.length,
    data: { masters },
  });
});

/**
 * @desc Update a master item
 */
exports.updateMaster = catchAsync(async (req, res, next) => {
  const master = await Master.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });

  if (!master) return next(new AppError("Master not found or not yours", 404));

  const allowedFields = ['type', 'name', 'code', 'description', 'isActive', 'parentId', 'metadata', 'imageUrl'];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      if (field === 'type') master[field] = req.body[field].toLowerCase();
      else if (field === 'name') master[field] = req.body[field].trim();
      else master[field] = req.body[field];
    }
  });

  try {
    const updated = await master.save();
    res.status(200).json({
      status: "success",
      data: { master: updated },
    });
  } catch (error) {
    if (error.code === 11000) {
      return next(new AppError("Duplicate value: A record with this Name or Code already exists.", 409));
    }
    return next(error);
  }
});

/**
 * @desc Delete (soft-delete) a master item
 */
exports.deleteMaster = catchAsync(async (req, res, next) => {
  const master = await Master.findOneAndUpdate(
    {
      _id: req.params.id,
      organizationId: req.user.organizationId,
    },
    { isActive: false },
    { new: true }
  );

  if (!master) return next(new AppError("Master not found", 404));

  res.status(200).json({
    status: "success",
    message: "Master deactivated successfully",
  });
});

/**
 * @desc Bulk add master items
 */
exports.bulkCreateMasters = catchAsync(async (req, res, next) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return next(new AppError("Items must be a non-empty array", 400));
  }

  const formattedItems = items.map((item, index) => {
    if (!item.type || !item.name) {
      throw new AppError(`Missing required fields at index ${index}`, 400);
    }
    return {
      organizationId: req.user.organizationId,
      type: item.type.toLowerCase(),
      name: item.name.trim(),
      slug: item.slug,
      code: item.code || null,
      description: item.description || null,
      createdBy: req.user._id,
      isActive: true
    };
  });

  try {
    const inserted = await Master.insertMany(formattedItems, { ordered: false });
    res.status(201).json({
      status: "success",
      insertedCount: inserted.length,
      data: { masters: inserted },
    });

  } catch (error) {
    if (error?.writeErrors) {
      const successful = error.insertedDocs || [];
      return res.status(207).json({
        status: "partial_success",
        insertedCount: successful.length,
        failedCount: error.writeErrors.length,
        failedItems: error.writeErrors.map(e => ({
          index: e.err.index,
          error: e.err.errmsg
        })),
        data: { masters: successful }
      });
    }
    return next(error);
  }
});

/**
 * @desc Bulk update master items
 * Accepts: { items: [{ _id: "...", ...changes }] }
 */
exports.bulkUpdateMasters = catchAsync(async (req, res, next) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return next(new AppError("Items must be a non-empty array", 400));
  }

  // Prepare bulkWrite operations
  const operations = items.map(item => {
    const { _id, ...updates } = item;
    if (!_id) return null;

    return {
      updateOne: {
        filter: { _id, organizationId: req.user.organizationId },
        update: { $set: updates }
      }
    };
  }).filter(Boolean);

  if (operations.length === 0) {
    return next(new AppError("No valid items with _id provided", 400));
  }

  const result = await Master.bulkWrite(operations);

  res.status(200).json({
    status: "success",
    message: "Bulk update completed",
    modifiedCount: result.modifiedCount
  });
});

/**
 * @desc Bulk delete (soft delete) master items
 * Accepts: { ids: ["id1", "id2"] }
 */
exports.bulkDeleteMasters = catchAsync(async (req, res, next) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new AppError("IDs must be a non-empty array", 400));
  }

  const result = await Master.updateMany(
    {
      _id: { $in: ids },
      organizationId: req.user.organizationId
    },
    { $set: { isActive: false } }
  );

  res.status(200).json({
    status: "success",
    message: `${result.modifiedCount} items deactivated successfully`,
  });
});