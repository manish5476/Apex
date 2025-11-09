// src/controllers/masterListController.js
const Branch = require('../models/branchModel');
const Role = require('../models/roleModel');
const Customer = require('../models/customerModel');
const Supplier = require('../models/supplierModel');
const Product = require('../models/productModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

exports.getMasterList = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  if (!orgId) return next(new AppError('Organization not found for current user.', 400));

  // Fetch all reference data concurrently
  const [branches, roles, customers, suppliers, products] = await Promise.all([
    Branch.find({ organizationId: orgId, isActive: true })
      .select('_id name')
      .lean(),

    Role.find({ organizationId: orgId })
      .select('_id name')
      .lean(),

    Customer.find({ organizationId: orgId, isActive: true })
      .select('_id name')
      .lean(),

    Supplier.find({ organizationId: orgId, isActive: true })
      .select('_id name')
      .lean(),

    Product.find({ organizationId: orgId, isActive: true })
      .select('_id name')
      .lean(),
  ]);

  // Bundle it cleanly
  res.status(200).json({
    status: 'success',
    data: {
      organizationId: orgId,
      branches,
      roles,
      customers,
      suppliers,
      products,
    },
  });
});
