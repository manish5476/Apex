const mongoose = require('mongoose');
const Product = require('../models/productModel');
const Purchase = require('../models/purchaseModel');
const Sales = require('../models/salesModel');
const SalesReturn = require('../models/salesReturnModel');
const StockValidationService = require('../services/stockValidationService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');

/**
 * Get current stock for all products in branch
 */
exports.getBranchStock = catchAsync(async (req, res) => {
  const { branchId } = req.params;
  
  const products = await Product.find({
    organizationId: req.user.organizationId,
    isActive: true,
    'inventory.branchId': branchId
  }).select('name sku sellingPrice purchasePrice inventory');
  
  const stockData = products.map(product => {
    const inventory = product.inventory.find(
      inv => String(inv.branchId) === String(branchId)
    );
    
    return {
      productId: product._id,
      name: product.name,
      sku: product.sku,
      sellingPrice: product.sellingPrice,
      costPrice: product.purchasePrice,
      quantity: inventory?.quantity || 0,
      reorderLevel: inventory?.reorderLevel || 10,
      value: (inventory?.quantity || 0) * (product.purchasePrice || 0)
    };
  });
  
  res.status(200).json({
    status: 'success',
    results: stockData.length,
    data: { stock: stockData }
  });
});

/**
 * Get stock movement history for a product
 */
exports.getStockMovement = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const { days = 30 } = req.query;
  
  const movement = await StockValidationService.getStockMovement(
    productId,
    req.user.branchId,
    req.user.organizationId,
    parseInt(days)
  );
  
  // Get current stock
  const currentStock = await StockValidationService.getAvailableStock(
    productId,
    req.user.branchId,
    req.user.organizationId
  );
  
  res.status(200).json({
    status: 'success',
    data: {
      currentStock,
      movement,
      summary: {
        netChange: movement.purchases - movement.sales + movement.returns,
        turnover: movement.sales > 0 ? 
          (movement.purchases / movement.sales).toFixed(2) : 0
      }
    }
  });
});

/**
 * Get low stock alert
 */
exports.getLowStock = catchAsync(async (req, res) => {
  const products = await Product.find({
    organizationId: req.user.organizationId,
    isActive: true,
    'inventory.branchId': req.user.branchId
  });
  
  const lowStock = [];
  
  for (const product of products) {
    const inventory = product.inventory.find(
      inv => String(inv.branchId) === String(req.user.branchId)
    );
    
    if (inventory && inventory.reorderLevel && inventory.quantity <= inventory.reorderLevel) {
      lowStock.push({
        productId: product._id,
        name: product.name,
        sku: product.sku,
        currentQuantity: inventory.quantity,
        reorderLevel: inventory.reorderLevel,
        deficit: inventory.reorderLevel - inventory.quantity + 10, // Suggest 10 more than reorder level
        lastPurchase: await this._getLastPurchaseDate(product._id, req.user.organizationId)
      });
    }
  }
  
  res.status(200).json({
    status: 'success',
    results: lowStock.length,
    data: { lowStock }
  });
});

/**
 * Get stock value report
 */
exports.getStockValue = catchAsync(async (req, res) => {
  const totalValue = await StockValidationService.getStockValue(
    req.user.branchId,
    req.user.organizationId
  );
  
  // Get breakdown by category
  const products = await Product.find({
    organizationId: req.user.organizationId,
    isActive: true
  });
  
  const categoryValue = {};
  
  for (const product of products) {
    const inventory = product.inventory.find(
      inv => String(inv.branchId) === String(req.user.branchId)
    );
    
    if (inventory && inventory.quantity > 0) {
      const value = inventory.quantity * (product.purchasePrice || 0);
      const category = product.category || 'Uncategorized';
      
      categoryValue[category] = (categoryValue[category] || 0) + value;
    }
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      totalValue,
      categoryBreakdown: categoryValue,
      currency: 'USD' // You can make this dynamic based on organization settings
    }
  });
});

/**
 * Update reorder level for a product
 */
exports.updateReorderLevel = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const { reorderLevel } = req.body;
  
  if (reorderLevel < 0) {
    return next(new AppError('Reorder level cannot be negative', 400));
  }
  
  const product = await Product.findOneAndUpdate(
    {
      _id: productId,
      organizationId: req.user.organizationId,
      'inventory.branchId': req.user.branchId
    },
    { $set: { 'inventory.$.reorderLevel': reorderLevel } },
    { new: true }
  );
  
  if (!product) {
    return next(new AppError('Product not found in this branch', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: { product }
  });
});

/**
 * Stock transfer between branches
 */
exports.transferStock = catchAsync(async (req, res, next) => {
  const { productId, fromBranchId, toBranchId, quantity, reason } = req.body;
  
  if (quantity <= 0) {
    return next(new AppError('Quantity must be positive', 400));
  }
  
  if (fromBranchId === toBranchId) {
    return next(new AppError('Cannot transfer to same branch', 400));
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Check source branch stock
    const sourceStock = await StockValidationService.getAvailableStock(
      productId,
      fromBranchId,
      req.user.organizationId,
      session
    );
    
    if (sourceStock < quantity) {
      throw new AppError(
        `Insufficient stock in source branch. Available: ${sourceStock}`,
        400
      );
    }
    
    const product = await Product.findOne({
      _id: productId,
      organizationId: req.user.organizationId
    }).session(session);
    
    if (!product) throw new AppError('Product not found', 404);
    
    // Reduce from source branch
    let sourceInv = product.inventory.find(
      inv => String(inv.branchId) === String(fromBranchId)
    );
    
    if (sourceInv) {
      sourceInv.quantity -= quantity;
    }
    
    // Add to destination branch
    let destInv = product.inventory.find(
      inv => String(inv.branchId) === String(toBranchId)
    );
    
    if (destInv) {
      destInv.quantity += quantity;
    } else {
      product.inventory.push({
        branchId: toBranchId,
        quantity: quantity,
        reorderLevel: 10
      });
    }
    
    await product.save({ session });
    
    // Create transfer record (optional - you might want a Transfer model)
    const Transfer = mongoose.model('Transfer');
    if (Transfer) {
      await Transfer.create([{
        organizationId: req.user.organizationId,
        productId,
        fromBranchId,
        toBranchId,
        quantity,
        reason,
        createdBy: req.user._id
      }], { session });
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      message: `Transferred ${quantity} units successfully`
    });
    
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});

/**
 * Helper: Get last purchase date for a product
 */
exports._getLastPurchaseDate = async (productId, organizationId) => {
  const lastPurchase = await Purchase.findOne({
    organizationId,
    'items.productId': productId,
    status: 'received'
  }).sort({ purchaseDate: -1 }).select('purchaseDate');
  
  return lastPurchase?.purchaseDate || null;
};

/**
 * Get stock aging report (slow-moving items)
 */
exports.getStockAging = catchAsync(async (req, res) => {
  const { thresholdDays = 90 } = req.query;
  
  const products = await Product.find({
    organizationId: req.user.organizationId,
    isActive: true
  });
  
  const agingReport = [];
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);
  
  for (const product of products) {
    const inventory = product.inventory.find(
      inv => String(inv.branchId) === String(req.user.branchId)
    );
    
    if (inventory && inventory.quantity > 0) {
      const lastSale = await Sales.findOne({
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        'items.productId': product._id,
        status: 'active'
      }).sort({ createdAt: -1 }).select('createdAt');
      
      const lastSaleDate = lastSale?.createdAt;
      const daysSinceSale = lastSaleDate ? 
        Math.floor((new Date() - lastSaleDate) / (1000 * 60 * 60 * 24)) : 
        null;
      
      const isSlowMoving = !lastSaleDate || lastSaleDate < thresholdDate;
      
      agingReport.push({
        productId: product._id,
        name: product.name,
        sku: product.sku,
        quantity: inventory.quantity,
        value: inventory.quantity * (product.purchasePrice || 0),
        lastSaleDate,
        daysSinceSale,
        isSlowMoving,
        category: product.category
      });
    }
  }
  
  // Sort by days since sale (oldest first)
  agingReport.sort((a, b) => {
    if (!a.lastSaleDate) return -1;
    if (!b.lastSaleDate) return 1;
    return new Date(a.lastSaleDate) - new Date(b.lastSaleDate);
  });
  
  res.status(200).json({
    status: 'success',
    results: agingReport.length,
    data: { agingReport }
  });
});

module.exports = exports;