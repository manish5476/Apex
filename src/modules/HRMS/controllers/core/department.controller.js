// controllers/core/department.controller.js
const mongoose = require('mongoose');
const Department = require('../../models/department.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError = require('../../../../core/utils/api/appError');
const factory = require('../../../../core/utils/api/handlerFactory');

// ======================================================
// HELPERS & VALIDATIONS
// ======================================================

const validateDepartmentData = async (data, organizationId, excludeId = null) => {
  const { name, code, parentDepartment, headOfDepartment } = data;
  
  // Check unique name
  const nameExists = await Department.findOne({
    organizationId,
    name,
    _id: { $ne: excludeId }
  });
  if (nameExists) throw new AppError('Department with this name already exists', 400);
  
  // Check unique code
  const codeExists = await Department.findOne({
    organizationId,
    code,
    _id: { $ne: excludeId }
  });
  if (codeExists) throw new AppError('Department with this code already exists', 400);
  
  // Validate parent department if provided
  if (parentDepartment) {
    const parent = await Department.findOne({
      _id: parentDepartment,
      organizationId
    });
    if (!parent) throw new AppError('Parent department not found', 400);
    
    // Prevent circular reference
    if (excludeId && parent.path?.includes(excludeId.toString())) {
      throw new AppError('Circular department reference detected', 400);
    }
  }
  
  // Validate HOD if provided
  if (headOfDepartment) {
    const hod = await User.findOne({
      _id: headOfDepartment,
      organizationId,
      isActive: true
    });
    if (!hod) throw new AppError('Head of Department user not found or inactive', 400);
  }
};

// ======================================================
// CRUD OPERATIONS
// ======================================================

/**
 * @desc    Create new department
 * @route   POST /api/v1/departments
 * @access  Private (Admin/HR)
 */
exports.createDepartment = catchAsync(async (req, res, next) => {
  // Set organization and audit fields
  req.body.organizationId = req.user.organizationId;
  req.body.createdBy = req.user._id;
  req.body.updatedBy = req.user._id;
  
  // Validate data
  await validateDepartmentData(req.body, req.user.organizationId);
  
  // Create department
  const department = await Department.create(req.body);
  
  // If HOD is assigned, update user's department
  if (req.body.headOfDepartment) {
    await User.findByIdAndUpdate(req.body.headOfDepartment, {
      'employeeProfile.departmentId': department._id
    });
  }
  
  // Update parent department's employee count if needed
  if (req.body.parentDepartment) {
    await Department.findByIdAndUpdate(req.body.parentDepartment, {
      $inc: { employeeCount: 1 }
    });
  }
  
  res.status(201).json({
    status: 'success',
    data: { department }
  });
});

/**
 * @desc    Get all departments
 * @route   GET /api/v1/departments
 * @access  Private
 */
exports.getAllDepartments = catchAsync(async (req, res, next) => {
  // Force tenant isolation
  req.query.organizationId = req.user.organizationId;
  
  // Handle tree view request
  if (req.query.tree === 'true') {
    const departments = await Department.find({
      organizationId: req.user.organizationId,
      isActive: req.query.isActive !== 'false'
    }).lean();
    
    // Build tree structure
    const deptMap = {};
    const roots = [];
    
    departments.forEach(dept => {
      dept.children = [];
      deptMap[dept._id] = dept;
    });
    
    departments.forEach(dept => {
      if (dept.parentDepartment && deptMap[dept.parentDepartment]) {
        deptMap[dept.parentDepartment].children.push(dept);
      } else {
        roots.push(dept);
      }
    });
    
    return res.status(200).json({
      status: 'success',
      results: roots.length,
      data: { departments: roots }
    });
  }
  
  // Regular list view with factory
  return factory.getAll(Department, {
    searchFields: ['name', 'code', 'description'],
    populate: [
      { path: 'headOfDepartment', select: 'name avatar' },
      { path: 'parentDepartment', select: 'name code' },
      { path: 'branchId', select: 'name' }
    ],
    sort: { level: 1, name: 1 }
  })(req, res, next);
});

/**
 * @desc    Get single department
 * @route   GET /api/v1/departments/:id
 * @access  Private
 */
exports.getDepartment = factory.getOne(Department, {
  populate: [
    { path: 'headOfDepartment', select: 'name email phone avatar' },
    { path: 'assistantHOD', select: 'name email' },
    { path: 'parentDepartment', select: 'name code path' },
    { path: 'branchId', select: 'name' },
    { path: 'createdBy', select: 'name' },
    { path: 'updatedBy', select: 'name' }
  ]
});

/**
 * @desc    Update department
 * @route   PATCH /api/v1/departments/:id
 * @access  Private (Admin/HR)
 */
exports.updateDepartment = catchAsync(async (req, res, next) => {
  const department = await Department.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!department) {
    return next(new AppError('Department not found', 404));
  }
  
  // Store old HOD for cleanup
  const oldHOD = department.headOfDepartment?.toString();
  const newHOD = req.body.headOfDepartment;
  
  // Validate updates
  if (req.body.name || req.body.code) {
    await validateDepartmentData(req.body, req.user.organizationId, req.params.id);
  }
  
  // Set audit field
  req.body.updatedBy = req.user._id;
  
  // Handle parent department change
  if (req.body.parentDepartment && req.body.parentDepartment !== department.parentDepartment?.toString()) {
    // Decrement old parent count
    if (department.parentDepartment) {
      await Department.findByIdAndUpdate(department.parentDepartment, {
        $inc: { employeeCount: -1 }
      });
    }
    // Increment new parent count
    await Department.findByIdAndUpdate(req.body.parentDepartment, {
      $inc: { employeeCount: 1 }
    });
  }
  
  // Update department
  const updatedDepartment = await Department.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  
  // Handle HOD change
  if (newHOD && newHOD !== oldHOD) {
    // Remove old HOD's department reference
    if (oldHOD) {
      await User.findByIdAndUpdate(oldHOD, {
        $unset: { 'employeeProfile.departmentId': 1 }
      });
    }
    // Set new HOD's department
    await User.findByIdAndUpdate(newHOD, {
      'employeeProfile.departmentId': department._id
    });
  }
  
  res.status(200).json({
    status: 'success',
    data: { department: updatedDepartment }
  });
});

/**
 * @desc    Delete department (soft delete)
 * @route   DELETE /api/v1/departments/:id
 * @access  Private (Admin only)
 */
exports.deleteDepartment = catchAsync(async (req, res, next) => {
  const department = await Department.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!department) {
    return next(new AppError('Department not found', 404));
  }
  
  // Check if department has employees
  const employeeCount = await User.countDocuments({
    organizationId: req.user.organizationId,
    'employeeProfile.departmentId': department._id,
    isActive: true
  });
  
  if (employeeCount > 0) {
    return next(new AppError('Cannot delete department with active employees. Please reassign employees first.', 400));
  }
  
  // Check if has child departments
  const childCount = await Department.countDocuments({
    organizationId: req.user.organizationId,
    parentDepartment: department._id,
    isActive: true
  });
  
  if (childCount > 0) {
    return next(new AppError('Cannot delete department with child departments. Please reassign or delete child departments first.', 400));
  }
  
  // Soft delete
  department.isActive = false;
  department.updatedBy = req.user._id;
  await department.save();
  
  // Update parent department count
  if (department.parentDepartment) {
    await Department.findByIdAndUpdate(department.parentDepartment, {
      $inc: { employeeCount: -1 }
    });
  }
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// ======================================================
// SPECIALIZED OPERATIONS
// ======================================================

/**
 * @desc    Get department hierarchy
 * @route   GET /api/v1/departments/hierarchy
 * @access  Private
 */
exports.getDepartmentHierarchy = catchAsync(async (req, res, next) => {
  const departments = await Department.find({
    organizationId: req.user.organizationId,
    isActive: true
  })
  .select('name code level path headOfDepartment employeeCount')
  .populate('headOfDepartment', 'name avatar')
  .lean();
  
  // Build hierarchy
  const buildTree = (parentId = null) => {
    return departments
      .filter(dept => 
        (parentId === null && !dept.parentDepartment) || 
        dept.parentDepartment?.toString() === parentId?.toString()
      )
      .map(dept => ({
        ...dept,
        children: buildTree(dept._id)
      }));
  };
  
  const hierarchy = buildTree();
  
  res.status(200).json({
    status: 'success',
    data: { hierarchy }
  });
});

/**
 * @desc    Get department employees
 * @route   GET /api/v1/departments/:id/employees
 * @access  Private
 */
exports.getDepartmentEmployees = catchAsync(async (req, res, next) => {
  const department = await Department.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!department) {
    return next(new AppError('Department not found', 404));
  }
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  // Get all descendants if includeSubDepts=true
  let departmentIds = [department._id];
  if (req.query.includeSubDepts === 'true') {
    const descendants = await Department.find({
      organizationId: req.user.organizationId,
      path: new RegExp(`^${department.path}`)
    }).select('_id');
    departmentIds = [...departmentIds, ...descendants.map(d => d._id)];
  }
  
  const query = {
    organizationId: req.user.organizationId,
    'employeeProfile.departmentId': { $in: departmentIds },
    isActive: req.query.isActive !== 'false'
  };
  
  const [employees, total] = await Promise.all([
    User.find(query)
      .select('name email phone avatar employeeProfile.designationId status isActive')
      .populate('employeeProfile.designationId', 'title grade')
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
 * @desc    Bulk update departments
 * @route   POST /api/v1/departments/bulk
 * @access  Private (Admin only)
 */
exports.bulkUpdateDepartments = catchAsync(async (req, res, next) => {
  const { operations } = req.body;
  
  if (!Array.isArray(operations)) {
    return next(new AppError('Operations must be an array', 400));
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const results = [];
    
    for (const op of operations) {
      if (op.action === 'create') {
        op.data.organizationId = req.user.organizationId;
        op.data.createdBy = req.user._id;
        op.data.updatedBy = req.user._id;
        
        const dept = await Department.create([op.data], { session });
        results.push({ action: 'create', data: dept[0] });
      }
      
      else if (op.action === 'update' && op.id) {
        const dept = await Department.findOneAndUpdate(
          { _id: op.id, organizationId: req.user.organizationId },
          { $set: { ...op.data, updatedBy: req.user._id } },
          { new: true, session }
        );
        results.push({ action: 'update', id: op.id, data: dept });
      }
      
      else if (op.action === 'delete' && op.id) {
        await Department.findOneAndUpdate(
          { _id: op.id, organizationId: req.user.organizationId },
          { $set: { isActive: false, updatedBy: req.user._id } },
          { session }
        );
        results.push({ action: 'delete', id: op.id });
      }
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      results: results.length,
      data: { operations: results }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Get department stats
 * @route   GET /api/v1/departments/stats/summary
 * @access  Private
 */
exports.getDepartmentStats = catchAsync(async (req, res, next) => {
  const stats = await Department.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        isActive: true
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: 'employeeProfile.departmentId',
        as: 'employees'
      }
    },
    {
      $project: {
        name: 1,
        code: 1,
        employeeCount: { $size: '$employees' },
        activeEmployees: {
          $size: {
            $filter: {
              input: '$employees',
              as: 'emp',
              cond: { $eq: ['$$emp.isActive', true] }
            }
          }
        },
        hodName: { $arrayElemAt: ['$headOfDepartment.name', 0] }
      }
    },
    {
      $group: {
        _id: null,
        totalDepartments: { $sum: 1 },
        totalEmployees: { $sum: '$employeeCount' },
        avgEmployeesPerDept: { $avg: '$employeeCount' },
        departments: { $push: '$$ROOT' }
      }
    }
  ]);
  
  res.status(200).json({
    status: 'success',
    data: { stats: stats[0] || { totalDepartments: 0, totalEmployees: 0 } }
  });
});