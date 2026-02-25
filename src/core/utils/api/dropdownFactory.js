
'use strict';

const catchAsync = require('./catchAsync');
const AppError = require('./appError');

// Helper to safely get nested object properties (e.g., if labelField is 'company.name')
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

/**
 * MASTER DROPDOWN & SEARCH API
 * Returns strict { label, value } pairs for UI framework optimization.
 */
exports.getDropdownList = (Model, options = {}) =>
  catchAsync(async (req, res, next) => {
    // 1. Core Tenant & Status Isolation
    const filter = { organizationId: req.user.organizationId };

    if (Model.schema.path("isDeleted")) filter.isDeleted = { $ne: true };
    if (Model.schema.path("isActive")) filter.isActive = { $ne: false };

    // 2. Extract Frontend Parameters
    const searchTerm = req.query.search || '';
    const page = Math.abs(parseInt(req.query.page, 10)) || 1;
    const limit = Math.abs(parseInt(req.query.limit, 10)) || 50; 
    const skip = (page - 1) * limit;

    // 3. Dynamic Fields Configuration
    const searchField = req.query.searchField || options.defaultSearchField || 'name';
    const labelField = req.query.labelField || options.defaultLabelField || 'name';

    // 4. Handle Edge-Case: Pre-selected IDs for Virtual Scrolling
    // (Ensures previously saved items show up in the UI even if they are on page 5)
    if (req.query.includeIds && !searchTerm) {
      const includeIds = req.query.includeIds.split(',');
      filter._id = { $in: includeIds }; 
      // Note: If you want to load these alongside normal page 1 data, 
      // you would use an $or array. For pure dropdown initialization, this isolates them.
    }

    // 5. Dynamic Search Logic
    if (searchTerm) {
      const escapedTerm = searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      filter[searchField] = { $regex: escapedTerm, $options: 'i' };
    }

    // 6. Execute Fast Query
    // We only select the _id and the specific field we are using for the label
    const rawResults = await Model.find(filter)
      .select(`_id ${labelField}`)
      .sort({ [labelField]: 1 })
      .skip(skip)
      .limit(limit)
      .lean(); // .lean() makes mapping extremely fast

    // 7. 🟢 THE MAGIC: Transform into strict { label, value } pairs
    const formattedResults = rawResults.map(doc => ({
      label: getNestedValue(doc, labelField) || 'Unknown', // Safe extraction
      value: doc._id
    }));

    res.status(200).json({
      status: 'success',
      results: formattedResults.length,
      data: formattedResults
    });
  });
  
