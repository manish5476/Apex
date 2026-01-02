const Master = require("./master.model");
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");

/**
 * @desc Create new master item (category, brand, etc.)
 */
exports.createMaster = catchAsync(async (req, res, next) => {
  const { type, name, code, description } = req.body;
  if (!type || !name) return next(new AppError("Type and name are required", 400));

  const newMaster = await Master.create({
    organizationId: req.user.organizationId,
    type: type.toLowerCase(),
    name: name.trim(),
    code,
    description,
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

  const masters = await Master.find(filter).sort("type name");

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
  const updated = await Master.findOneAndUpdate(
    {
      _id: req.params.id,
      organizationId: req.user.organizationId,
    },
    req.body,
    { new: true, runValidators: true }
  );

  if (!updated) return next(new AppError("Master not found or not yours", 404));
  res.status(200).json({
    status: "success",
    data: { master: updated },
  });
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
 * @desc Bulk add master items (category, brand, etc.)
 * @route POST /api/v1/master/bulk
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
      code: item.code || null,
      description: item.description || null,
      createdBy: req.user._id
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
