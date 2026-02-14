const Master = require("./master.model");
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");

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

  const masters = await Master.find(filter).sort("-createdAt"); // Newest first usually better

  res.status(200).json({
    status: "success",
    results: masters.length,
    data: { masters },
  });
});

/**
 * @desc Update a master item
 * FIXED: Uses findOne + save() to trigger hooks (slug generation) and handle duplicates gracefully
 */
exports.updateMaster = catchAsync(async (req, res, next) => {
  const master = await Master.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });

  if (!master) return next(new AppError("Master not found or not yours", 404));

  // Update fields if they exist in body
  const allowedFields = ['type', 'name', 'code', 'description', 'isActive', 'parentId', 'metadata'];
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      if (field === 'type') master[field] = req.body[field].toLowerCase();
      else if (field === 'name') master[field] = req.body[field].trim();
      else master[field] = req.body[field];
    }
  });

  try {
    // This triggers the pre('save') hook in your model, updating the slug if name changed
    const updated = await master.save();

    res.status(200).json({
      status: "success",
      data: { master: updated },
    });
  } catch (error) {
    // Handle Duplicate Key Error (E11000)
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
      slug: item.slug, // Respect frontend slug if provided
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
 * @desc Bulk soft-delete multiple master items by IDs
 * @body { ids: string[] }  — array of master _id values
 */
exports.bulkDeleteMasters = catchAsync(async (req, res, next) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new AppError("Please provide a non-empty array of IDs", 400));
  }

  // Validate all IDs are valid ObjectIds (optional but recommended)
  const validIds = ids.filter(id => mongoose.isValidObjectId(id));
  if (validIds.length !== ids.length) {
    return next(new AppError("One or more invalid ID formats", 400));
  }

  const result = await Master.updateMany(
    {
      _id: { $in: validIds },
      organizationId: req.user.organizationId,
      isActive: true,           // only affect currently active ones (optional)
    },
    { isActive: false },
    { new: true }
  );

  res.status(200).json({
    status: "success",
    message: `Deactivated ${result.modifiedCount} master items`,
    modifiedCount: result.modifiedCount,
  });
});

/**
 * @desc Bulk update multiple master items
 * @body {
 *   ids: string[],               // required
 *   data: {                      // fields to update (same as single update)
 *     type?, name?, code?, description?, isActive?, parentId?, metadata?
 *   }
 * }
 */
exports.bulkUpdateMasters = catchAsync(async (req, res, next) => {
  const { ids, data } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new AppError("Please provide a non-empty array of IDs", 400));
  }

  if (!data || Object.keys(data).length === 0) {
    return next(new AppError("No update data provided", 400));
  }

  // Validate IDs
  const validIds = ids.filter(id => mongoose.isValidObjectId(id));
  if (validIds.length !== ids.length) {
    return next(new AppError("One or more invalid ID formats", 400));
  }

  // Prepare update object (same allowed fields logic as single update)
  const allowedFields = ['type', 'name', 'code', 'description', 'isActive', 'parentId', 'metadata'];
  const updateObj = {};

  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      if (field === 'type') {
        updateObj[field] = data[field].toLowerCase();
      } else if (field === 'name') {
        updateObj[field] = data[field].trim();
      } else {
        updateObj[field] = data[field];
      }
    }
  });

  if (Object.keys(updateObj).length === 0) {
    return next(new AppError("No valid fields to update", 400));
  }

  // Note: bulk update with .updateMany() → DOES NOT trigger pre('save') hooks!
  // → slug won't auto-update if you're changing 'name'
  // If slug update on name change is critical → you must fetch → update one-by-one (slower)

  const result = await Master.updateMany(
    {
      _id: { $in: validIds },
      organizationId: req.user.organizationId,
    },
    { $set: updateObj },
    { runValidators: true }   // still good to have
  );

  // If you really need slug regeneration when name changes in bulk:
  // You would need to do something like this instead (slower but correct slugs):
  /*
  const masters = await Master.find({
    _id: { $in: validIds },
    organizationId: req.user.organizationId,
  });

  for (const master of masters) {
    Object.assign(master, updateObj);
    await master.save();           // triggers slug hook
  }
  */

  res.status(200).json({
    status: "success",
    message: `Updated ${result.modifiedCount} master items`,
    modifiedCount: result.modifiedCount,
  });
});
