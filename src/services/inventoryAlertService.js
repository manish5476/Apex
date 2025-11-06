// src/services/inventoryAlertService.js
const Product = require("../models/productModel");
const AppError = require("../utils/appError");

/**
 * Check stock for a specific product (by productId) and return alert info.
 * This function does NOT send emails — notificationService handles that.
 */
exports.checkStock = async (productId) => {
  if (!productId) throw new AppError("Product ID required", 400);
  const product = await Product.findById(productId).populate(
    "organizationId",
    "name primaryEmail",
  );
  if (!product) throw new AppError("Product not found", 404);

  const totalStock = (product.inventory || []).reduce(
    (s, b) => s + (b.quantity || 0),
    0,
  );
  return {
    product,
    totalStock,
    isLow: totalStock < (product.reorderLevel ?? 10),
  };
};

/**
 * Get low stock list for an organization (threshold optional).
 */
exports.getLowStockForOrg = async (organizationId, threshold = 10) => {
  if (!organizationId) throw new AppError("organizationId required", 400);

  const products = await Product.aggregate([
    { $match: { organizationId: organizationId } },
    { $unwind: "$inventory" },
    {
      $group: {
        _id: "$_id",
        name: { $first: "$name" },
        sku: { $first: "$sku" },
        totalStock: { $sum: "$inventory.quantity" },
      },
    },
    { $match: { totalStock: { $lt: threshold } } },
    { $sort: { totalStock: 1 } },
  ]);

  return products;
};
