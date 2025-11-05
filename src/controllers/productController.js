const Product = require('../models/productModel');
const factory = require('../utils/handlerFactory');
/**
 * @desc    Create a new product
 * @route   POST /api/v1/products
 * @note    Factory's 'createOne' auto-adds orgId, createdBy
 */
exports.createProduct = factory.createOne(Product);

/**
 * @desc    Get all products for the organization
 * @route   GET /api/v1/products
 * @note    Factory's 'getAll' auto-filters by orgId
 */
exports.getAllProducts = factory.getAll(Product);

/**
 * @desc    Get a single product by ID
 * @route   GET /api/v1/products/:id
 * @note    Factory's 'getOne' auto-checks orgId
 */
exports.getProduct = factory.getOne(Product, [
  { path: 'inventory.branchId', select: 'name' }, // Populate branch name in inventory
  { path: 'defaultSupplierId', select: 'companyName' } // Populate supplier name
]);

/**
 * @desc    Update a product
 * @route   PATCH /api/v1/products/:id
 * @note    Factory's 'updateOne' auto-checks orgId
 */
exports.updateProduct = factory.updateOne(Product);

/**
 * @desc    Delete a product (soft delete)
 * @route   DELETE /api/v1/products/:id
 * @note    Factory's 'deleteOne' auto-checks orgId and handles soft delete
 */
exports.deleteProduct = factory.deleteOne(Product);

/**
 * @desc    Restore a soft-deleted product
 * @route   PATCH /api/v1/products/:id/restore
 */
exports.restoreProduct = factory.restoreOne(Product);