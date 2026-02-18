// controllers/core/designation.controller.js
const mongoose = require('mongoose');
const Designation = require('../../models/designation.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/catchAsync');
const AppError = require('../../../../core/utils/appError');
const factory = require('../../../../core/utils/handlerFactory');

// ======================================================
// HELPERS & VALIDATIONS
// ======================================================

const validateDesignationData = async (data, organizationId, excludeId = null) => {
  const { title, code } = data;
  
  // Check unique title
  const titleExists = await Designation.findOne({
    organizationId,
    title,
    _id: { $ne: excludeId }
  });
  if (titleExists) throw new AppError('Designation with this title already exists', 400);
  
  // Check unique code
  const codeExists = await Designation.findOne({
    organizationId,
    code,
    _id: { $ne: excludeId }
  });
  if (codeExists) throw new AppError('Designation with this code already exists', 400);
  
  // Validate next designation if provided
  if (data.nextDesignation) {
    const next = await Designation.findOne({
      _id: data.nextDesignation,
      organizationId
    });
    if (!next) throw new AppError('Next designation not found', 400);
    
    // Ensure career progression is forward
    if (next.level <= data.level) {
      throw new AppError('Next designation must have higher level', 400);
    }
  }
  
  // Validate reportsTo designations
  if (data.reportsTo && data.reportsTo.length) {
    const validReportsTo = await Designation.find({
      _id: { $in: data.reportsTo },
      organizationId
    });
    if (validReportsTo.length !== data.reportsTo.length) {
      throw new AppError('One or more reporting designations not found', 400);
    }
  }
};

// ======================================================
// CRUD OPERATIONS
// ======================================================

/**
 * @desc    Create new designation
 * @route   POST /api/v1/designations
 * @access  Private (Admin/HR)
 */
exports.createDesignation = catchAsync(async (req, res, next) => {
  // Set organization and audit fields
  req.body.organizationId = req.user.organizationId;
  req.body.createdBy = req.user._id;
  req.body.updatedBy = req.user._id;
  
  // Validate data
  await validateDesignationData(req.body, req.user.organizationId);
  
  // Create designation
  const designation = await Designation.create(req.body);
  
  res.status(201).json({
    status: 'success',
    data: { designation }
  });
});

/**
 * @desc    Get all designations
 * @route   GET /api/v1/designations
 * @access  Private
 */
exports.getAllDesignations = factory.getAll(Designation, {
  searchFields: ['title', 'code', 'description', 'jobFamily'],
  populate: [
    { path: 'nextDesignation', select: 'title code level' },
    { path: 'reportsTo', select: 'title code level' },
    { path: 'createdBy', select: 'name' }
  ],
  sort: { level: 1, grade: 1, title: 1 }
});

/**
 * @desc    Get single designation
 * @route   GET /api/v1/designations/:id
 * @access  Private
 */
exports.getDesignation = factory.getOne(Designation, {
  populate: [
    { path: 'nextDesignation', select: 'title code level grade salaryBand' },
    { path: 'reportsTo', select: 'title code level' },
    { path: 'createdBy', select: 'name' },
    { path: 'updatedBy', select: 'name' }
  ]
});

/**
 * @desc    Update designation
 * @route   PATCH /api/v1/designations/:id
 * @access  Private (Admin/HR)
 */
exports.updateDesignation = catchAsync(async (req, res, next) => {
  const designation = await Designation.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!designation) {
    return next(new AppError('Designation not found', 404));
  }
  
  // Validate updates
  if (req.body.title || req.body.code) {
    await validateDesignationData(req.body, req.user.organizationId, req.params.id);
  }
  
  // Set audit field
  req.body.updatedBy = req.user._id;
  
  const updatedDesignation = await Designation.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  
  res.status(200).json({
    status: 'success',
    data: { designation: updatedDesignation }
  });
});

/**
 * @desc    Delete designation (soft delete)
 * @route   DELETE /api/v1/designations/:id
 * @access  Private (Admin only)
 */
exports.deleteDesignation = catchAsync(async (req, res, next) => {
  const designation = await Designation.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!designation) {
    return next(new AppError('Designation not found', 404));
  }
  
  // Check if designation is in use
  const employeeCount = await User.countDocuments({
    organizationId: req.user.organizationId,
    'employeeProfile.designationId': designation._id,
    isActive: true
  });
  
  if (employeeCount > 0) {
    return next(new AppError(
      `Cannot delete designation with ${employeeCount} active employees. Please reassign employees first.`,
      400
    ));
  }
  
  // Check if it's referenced as next designation
  const referencedAsNext = await Designation.countDocuments({
    organizationId: req.user.organizationId,
    nextDesignation: designation._id
  });
  
  if (referencedAsNext > 0) {
    return next(new AppError(
      'Cannot delete designation as it is referenced as next designation in career path',
      400
    ));
  }
  
  // Soft delete
  designation.isActive = false;
  designation.updatedBy = req.user._id;
  await designation.save();
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// ======================================================
// SPECIALIZED OPERATIONS
// ======================================================

/**
 * @desc    Get career path
 * @route   GET /api/v1/designations/career-path/:id
 * @access  Private
 */
exports.getCareerPath = catchAsync(async (req, res, next) => {
  const startDesignation = await Designation.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
    isActive: true
  });
  
  if (!startDesignation) {
    return next(new AppError('Designation not found', 404));
  }
  
  // Build career path forward
  const careerPath = [];
  let current = startDesignation;
  
  while (current) {
    careerPath.push({
      _id: current._id,
      title: current.title,
      code: current.code,
      level: current.level,
      grade: current.grade,
      salaryBand: current.salaryBand,
      promotionAfterYears: current.promotionAfterYears
    });
    
    if (!current.nextDesignation) break;
    
    current = await Designation.findById(current.nextDesignation)
      .select('title code level grade salaryBand promotionAfterYears nextDesignation');
  }
  
  // Get lateral moves (same level, different job families)
  const lateralMoves = await Designation.find({
    organizationId: req.user.organizationId,
    level: startDesignation.level,
    _id: { $ne: startDesignation._id },
    isActive: true
  }).select('title code grade jobFamily');
  
  res.status(200).json({
    status: 'success',
    data: {
      current: startDesignation,
      careerPath: careerPath.slice(1), // Remove current from path
      lateralMoves
    }
  });
});

/**
 * @desc    Get designation hierarchy
 * @route   GET /api/v1/designations/hierarchy
 * @access  Private
 */
exports.getDesignationHierarchy = catchAsync(async (req, res, next) => {
  const designations = await Designation.find({
    organizationId: req.user.organizationId,
    isActive: true
  })
  .select('title code level grade jobFamily reportsTo')
  .lean();
  
  // Group by level
  const byLevel = {};
  designations.forEach(d => {
    if (!byLevel[d.level]) byLevel[d.level] = [];
    byLevel[d.level].push(d);
  });
  
  // Build reporting structure
  const reportingHierarchy = [];
  
  // Find top-level (no reportsTo or reportsTo empty)
  const topLevel = designations.filter(d => !d.reportsTo || d.reportsTo.length === 0);
  
  const buildReportingTree = (parent) => {
    const children = designations.filter(d => 
      d.reportsTo?.some(r => r.toString() === parent._id.toString())
    );
    
    return {
      ...parent,
      children: children.map(child => buildReportingTree(child))
    };
  };
  
  topLevel.forEach(d => {
    reportingHierarchy.push(buildReportingTree(d));
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      byLevel,
      reportingHierarchy
    }
  });
});

/**
 * @desc    Get employees by designation
 * @route   GET /api/v1/designations/:id/employees
 * @access  Private
 */
exports.getDesignationEmployees = catchAsync(async (req, res, next) => {
  const designation = await Designation.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!designation) {
    return next(new AppError('Designation not found', 404));
  }
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  const query = {
    organizationId: req.user.organizationId,
    'employeeProfile.designationId': designation._id,
    isActive: req.query.isActive !== 'false'
  };
  
  const [employees, total] = await Promise.all([
    User.find(query)
      .select('name email phone avatar employeeProfile.departmentId employeeProfile.employeeId status')
      .populate('employeeProfile.departmentId', 'name')
      .skip(skip)
      .limit(limit)
      .sort(req.query.sort || 'name'),
    User.countDocuments(query)
  ]);
  
  res.status(200).json({
    status: 'success',
    results: employees.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: { employees }
  });
});

/**
 * @desc    Get salary bands by level
 * @route   GET /api/v1/designations/salary-bands
 * @access  Private (Admin/Finance)
 */
exports.getSalaryBands = catchAsync(async (req, res, next) => {
  const bands = await Designation.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        isActive: true,
        'salaryBand.min': { $exists: true }
      }
    },
    {
      $group: {
        _id: { level: '$level', grade: '$grade' },
        minSalary: { $min: '$salaryBand.min' },
        maxSalary: { $max: '$salaryBand.max' },
        avgSalary: { $avg: '$salaryBand.min' },
        designations: { $push: { title: '$title', code: '$code' } },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.level': 1, '_id.grade': 1 }
    }
  ]);
  
  // Get current market rates (could integrate with external API)
  const marketRates = {
    // This would be dynamic in production
    'A': { min: 1000000, max: 3000000 },
    'B': { min: 500000, max: 1500000 },
    'C': { min: 300000, max: 800000 }
  };
  
  res.status(200).json({
    status: 'success',
    data: {
      internal: bands,
      marketRates
    }
  });
});

/**
 * @desc    Get promotion eligibility
 * @route   GET /api/v1/designations/promotion-eligible
 * @access  Private
 */
exports.getPromotionEligible = catchAsync(async (req, res, next) => {
  const { designationId, years = 2 } = req.query;
  
  if (!designationId) {
    return next(new AppError('Please provide designation ID', 400));
  }
  
  const designation = await Designation.findOne({
    _id: designationId,
    organizationId: req.user.organizationId
  });
  
  if (!designation) {
    return next(new AppError('Designation not found', 404));
  }
  
  // Find employees with this designation who joined more than X years ago
  const eligibleEmployees = await User.find({
    organizationId: req.user.organizationId,
    'employeeProfile.designationId': designation._id,
    'employeeProfile.dateOfJoining': {
      $lte: new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000)
    },
    isActive: true,
    status: 'approved'
  })
  .select('name employeeProfile.employeeId employeeProfile.dateOfJoining employeeProfile.departmentId')
  .populate('employeeProfile.departmentId', 'name')
  .populate('employeeProfile.designationId', 'title')
  .lean();
  
  // Get next designation info
  let nextDesignation = null;
  if (designation.nextDesignation) {
    nextDesignation = await Designation.findById(designation.nextDesignation)
      .select('title code level grade salaryBand');
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      currentDesignation: designation,
      nextDesignation,
      eligibleCount: eligibleEmployees.length,
      employees: eligibleEmployees
    }
  });
});

/**
 * @desc    Bulk create designations
 * @route   POST /api/v1/designations/bulk
 * @access  Private (Admin only)
 */
exports.bulkCreateDesignations = catchAsync(async (req, res, next) => {
  const { designations } = req.body;
  
  if (!Array.isArray(designations) || designations.length === 0) {
    return next(new AppError('Please provide an array of designations', 400));
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const created = [];
    const errors = [];
    
    for (const data of designations) {
      try {
        // Set common fields
        data.organizationId = req.user.organizationId;
        data.createdBy = req.user._id;
        data.updatedBy = req.user._id;
        
        // Validate uniqueness
        await validateDesignationData(data, req.user.organizationId);
        
        const designation = await Designation.create([data], { session });
        created.push(designation[0]);
      } catch (error) {
        errors.push({
          data,
          error: error.message
        });
      }
    }
    
    await session.commitTransaction();
    
    res.status(201).json({
      status: 'success',
      results: created.length,
      errors: errors.length,
      data: { designations: created, errors }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});