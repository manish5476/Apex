// src/controllers/branchController.js
const Branch = require('../models/branchModel');
const Organization = require('../models/organizationModel');
const catchAsync = require('../utils/catchAsync');
const factory = require('../utils/handlerFactory');

// // GET /branches
// exports.getAllBranches = factory.getAll(Branch, {
//   searchFields: ['name', 'branchCode', 'phoneNumber', 'address.city', 'address.state'],
//   populate: [
//     { path: 'managerId', select: 'name email' },
//     { path: 'organizationId', select: 'name' }
//   ]
// });
/* -------------------------------------------------------------
   Get All EMIs
------------------------------------------------------------- */
exports.getAllEmis = factory.getAll(EMI, {
  // Optional: Add search fields if you want to search by these properties
  searchFields: ['status', 'paymentMethod'], 
  
  // The critical part: 'populate' must be a key in this object
  populate: [
    { 
      path: 'customerId', 
      select: 'name email phone avatar billingAddress gstNumber panNumber type outstandingBalance'
    },
    {
      path: 'invoiceId',
      select: 'invoiceNumber grandTotal balanceAmount'
    }
  ]
});
// GET /branches/my
exports.getMyBranches = factory.getAll(Branch, {
  fields: 'name branchCode isActive',
  searchFields: ['name', 'branchCode']
});

// GET /branches/:id
exports.getBranch = factory.getOne(Branch, {
  populate: [
    { path: 'managerId', select: 'name email' },
    { path: 'organizationId', select: 'name' }
  ]
});

// POST /branches
exports.createBranch = catchAsync(async (req, res, next) => {
  req.body.organizationId = req.user.organizationId;

  // if new branch = main, demote others
  if (req.body.isMainBranch) {
    await Branch.updateMany(
      { organizationId: req.user.organizationId },
      { $set: { isMainBranch: false } }
    );
  }

  const branch = await Branch.create(req.body);

  await Organization.findByIdAndUpdate(req.user.organizationId, {
    $addToSet: { branches: branch._id }
  });

  res.status(201).json({
    status: 'success',
    data: { data: branch }
  });
});

// PATCH /branches/:id
exports.updateBranch = catchAsync(async (req, res, next) => {
  if (req.body.isMainBranch) {
    await Branch.updateMany(
      { organizationId: req.user.organizationId },
      { $set: { isMainBranch: false } }
    );
  }

  return factory.updateOne(Branch)(req, res, next);
});

// DELETE /branches/:id  (soft by default)
exports.deleteBranch = factory.deleteOne(Branch);
