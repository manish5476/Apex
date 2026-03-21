// src/modules/_legacy/services/stockValidationService.js
const Product = require('./product.model');
const mongoose = require('mongoose');

class StockValidationService {
  /**
   * Validate stock availability for sale
   * OPTIMIZED: Uses a single DB query for all items instead of looping queries
   */
  static async validateSale(items, branchId, organizationId, session = null) {
    const errors = [];
    const warnings = [];

    let totalStock = 0;
    let totalRequested = 0;

    // 1. Extract all product IDs to query them at once (Performance Boost)
    const productIds = items.map(item => item.productId).filter(Boolean);

    // 2. Fetch all products in a single database call
    const products = await Product.find({
      _id: { $in: productIds },
      organizationId,
      isActive: true
    }).session(session);

    // 3. Create a map for quick product lookup by ID in the loop
    const productMap = products.reduce((acc, product) => {
      acc[product._id.toString()] = product;
      return acc;
    }, {});

    for (const item of items) {
      // const requiredQty = Number(item.quantity ?? item.qty || 0);
const requiredQty = Number(item.quantity || item.qty || 0);
      // ❗ HARD VALIDATION
      if (!requiredQty || requiredQty <= 0) {
        errors.push({
          productId: item.productId,
          productName: item.productName,
          available: 0,
          required: requiredQty,
          reason: 'Invalid quantity'
        });
        continue;
      }

      const product = productMap[item.productId];

      if (!product) {
        errors.push({
          productId: item.productId,
          productName: item.productName,
          available: 0,
          required: requiredQty,
          reason: 'Product not found or inactive'
        });
        continue;
      }

      const inventory = product.inventory.find(
        inv => String(inv.branchId) === String(branchId)
      );

      const availableQty = inventory?.quantity ?? 0;

      totalStock += availableQty;
      totalRequested += requiredQty;

      // ❌ BLOCK SALE
      if (availableQty < requiredQty) {
        errors.push({
          productId: product._id,
          productName: product.name,
          available: availableQty,
          required: requiredQty,
          reason: 'Insufficient stock'
        });
      }

      // ⚠ LOW STOCK WARNING
      if (
        inventory?.reorderLevel &&
        (availableQty - requiredQty) <= inventory.reorderLevel
      ) {
        warnings.push({
          productId: product._id,
          productName: product.name,
          availableAfterSale: availableQty - requiredQty,
          reorderLevel: inventory.reorderLevel,
          message: 'Stock will fall below reorder level'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalStock,
        totalRequested
      }
    };
  }

  /**
   * Get available stock for a product
   */
  static async getAvailableStock(productId, branchId, organizationId, session = null) {
    const product = await Product.findOne({
      _id: productId,
      organizationId
    }).session(session);
    
    if (!product) return 0;
    
    const inventory = product.inventory.find(
      inv => String(inv.branchId) === String(branchId)
    );
    
    return inventory?.quantity || 0;
  }
  
  /**
   * Validate stock for purchase cancellation
   */
  static async validatePurchaseCancellation(purchase, session = null) {
    const errors = [];
    const Sales = mongoose.model('Sales');
    
    for (const item of purchase.items) {
      const totalSold = await Sales.aggregate([
        { $match: { 
          organizationId: purchase.organizationId,
          branchId: purchase.branchId,
          status: { $ne: 'cancelled' },
          'items.productId': item.productId
        }},
        { $unwind: '$items' },
        { $match: { 'items.productId': item.productId } },
        { $group: { _id: null, total: { $sum: '$items.qty' } } }
      ]).session(session);
      
      const soldQty = totalSold[0]?.total || 0;
      
      const product = await Product.findById(item.productId).session(session);
      const inventory = product?.inventory?.find(
        inv => String(inv.branchId) === String(purchase.branchId)
      );
      
      const currentStock = inventory?.quantity || 0;
      const netAvailable = currentStock - soldQty;
      
      if (netAvailable < item.quantity) {
        errors.push(
          `Cannot cancel purchase for ${product?.name || item.productId}. ` +
          `Only ${netAvailable} units available after sales, ${item.quantity} needed.`
        );
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Get stock movement history
   * FIXED: Added 'new' to mongoose.Types.ObjectId
   */
  static async getStockMovement(productId, branchId, organizationId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Safely instantiate ObjectIds
    const orgIdObj = new mongoose.Types.ObjectId(organizationId);
    const branchIdObj = new mongoose.Types.ObjectId(branchId);
    const prodIdObj = new mongoose.Types.ObjectId(productId);

    const [purchases, sales, returns] = await Promise.all([
      // Purchases
      mongoose.model('Purchase').aggregate([
        { $match: {
          organizationId: orgIdObj,
          branchId: branchIdObj,
          status: { $ne: 'cancelled' },
          purchaseDate: { $gte: startDate }
        }},
        { $unwind: '$items' },
        { $match: { 'items.productId': prodIdObj } },
        { $group: {
          _id: null,
          total: { $sum: '$items.quantity' },
          count: { $sum: 1 }
        }}
      ]),
      
      // Sales
      mongoose.model('Sales').aggregate([
        { $match: {
          organizationId: orgIdObj,
          branchId: branchIdObj,
          status: { $ne: 'cancelled' },
          createdAt: { $gte: startDate }
        }},
        { $unwind: '$items' },
        { $match: { 'items.productId': prodIdObj } },
        { $group: {
          _id: null,
          total: { $sum: '$items.qty' },
          count: { $sum: 1 }
        }}
      ]),
      
      // Returns (sales returns)
      mongoose.model('SalesReturn').aggregate([
        { $match: {
          organizationId: orgIdObj,
          branchId: branchIdObj,
          status: 'approved',
          createdAt: { $gte: startDate }
        }},
        { $unwind: '$items' },
        { $match: { 'items.productId': prodIdObj } },
        { $group: {
          _id: null,
          total: { $sum: '$items.quantity' },
          count: { $sum: 1 }
        }}
      ])
    ]);
    
    return {
      purchases: purchases[0]?.total || 0,
      purchaseCount: purchases[0]?.count || 0,
      sales: sales[0]?.total || 0,
      salesCount: sales[0]?.count || 0,
      returns: returns[0]?.total || 0,
      returnCount: returns[0]?.count || 0
    };
  }
  
  /**
   * Get stock value at cost
   */
  static async getStockValue(branchId, organizationId) {
    const products = await Product.find({
      organizationId,
      isActive: true
    }).populate('inventory');
    
    let totalValue = 0;
    
    for (const product of products) {
      const inventory = product.inventory.find(
        inv => String(inv.branchId) === String(branchId)
      );
      
      if (inventory && inventory.quantity > 0) {
        totalValue += inventory.quantity * (product.purchasePrice || 0);
      }
    }
    
    return totalValue;
  }
}

module.exports = StockValidationService;
// const Product = require('../../inventory/core/product.model');
// const mongoose = require('mongoose');

// class StockValidationService {
//   /**
//    * Validate stock availability for sale
//    */
//   // static async validateSale(items, branchId, organizationId, session = null) {
//   //   const errors = [];
//   //   const warnings = [];
    
//   //   for (const item of items) {
//   //     const product = await Product.findOne({
//   //       _id: item.productId,
//   //       organizationId,
//   //       isActive: true
//   //     }).session(session);
      
//   //     if (!product) {
//   //       errors.push(`Product not found or inactive: ${item.productId}`);
//   //       continue;
//   //     }
      
//   //     const inventory = product.inventory.find(
//   //       inv => String(inv.branchId) === String(branchId)
//   //     );
      
//   //     const availableQty = inventory?.quantity || 0;
//   //     const requiredQty = item.quantity || item.qty || 0;
      
//   //     if (availableQty < requiredQty) {
//   //       errors.push(
//   //         `Insufficient stock for ${product.name}. Available: ${availableQty}, Required: ${requiredQty}`
//   //       );
//   //     }
      
//   //     // Warning for low stock (below reorder level)
//   //     if (inventory && inventory.reorderLevel && availableQty - requiredQty < inventory.reorderLevel) {
//   //       warnings.push(
//   //         `${product.name} will be below reorder level after this sale`
//   //       );
//   //     }
//   //   }
    
//   //   return {
//   //     isValid: errors.length === 0,
//   //     errors,
//   //     warnings
//   //   };
//   // }
//   static async validateSale(items, branchId, organizationId, session = null) {
//   const errors = [];
//   const warnings = [];

//   let totalStock = 0;
//   let totalRequested = 0;

//   for (const item of items) {
//     const requiredQty = Number(item.quantity ?? item.qty);

//     // ❗ HARD VALIDATION
//     if (!requiredQty || requiredQty <= 0) {
//       errors.push({
//         productId: item.productId,
//         productName: item.productName,
//         available: 0,
//         required: requiredQty,
//         reason: 'Invalid quantity'
//       });
//       continue;
//     }

//     const product = await Product.findOne({
//       _id: item.productId,
//       organizationId,
//       isActive: true
//     }).session(session);

//     if (!product) {
//       errors.push({
//         productId: item.productId,
//         productName: item.productName,
//         available: 0,
//         required: requiredQty,
//         reason: 'Product not found or inactive'
//       });
//       continue;
//     }

//     const inventory = product.inventory.find(
//       inv => String(inv.branchId) === String(branchId)
//     );

//     const availableQty = inventory?.quantity ?? 0;

//     totalStock += availableQty;
//     totalRequested += requiredQty;

//     // ❌ BLOCK SALE
//     if (availableQty < requiredQty) {
//       errors.push({
//         productId: product._id,
//         productName: product.name,
//         available: availableQty,
//         required: requiredQty
//       });
//     }

//     // ⚠ LOW STOCK WARNING
//     if (
//       inventory?.reorderLevel &&
//       availableQty - requiredQty <= inventory.reorderLevel
//     ) {
//       warnings.push({
//         productId: product._id,
//         productName: product.name,
//         availableAfterSale: availableQty - requiredQty,
//         reorderLevel: inventory.reorderLevel,
//         message: 'Stock will fall below reorder level'
//       });
//     }
//   }

//   return {
//     isValid: errors.length === 0,
//     errors,
//     warnings,
//     summary: {
//       totalStock,
//       totalRequested
//     }
//   };
// }

//   /**
//    * Get available stock for a product
//    */
//   static async getAvailableStock(productId, branchId, organizationId, session = null) {
//     const product = await Product.findOne({
//       _id: productId,
//       organizationId
//     }).session(session);
    
//     if (!product) return 0;
    
//     const inventory = product.inventory.find(
//       inv => String(inv.branchId) === String(branchId)
//     );
    
//     return inventory?.quantity || 0;
//   }
  
//   /**
//    * Validate stock for purchase cancellation
//    */
//   static async validatePurchaseCancellation(purchase, session = null) {
//     const errors = [];
    
//     for (const item of purchase.items) {
//       // Get total sales of this product from this branch
//       const Sales = mongoose.model('Sales');
//       const totalSold = await Sales.aggregate([
//         { $match: { 
//           organizationId: purchase.organizationId,
//           branchId: purchase.branchId,
//           status: { $ne: 'cancelled' },
//           'items.productId': item.productId
//         }},
//         { $unwind: '$items' },
//         { $match: { 'items.productId': item.productId } },
//         { $group: { _id: null, total: { $sum: '$items.qty' } } }
//       ]).session(session);
      
//       const soldQty = totalSold[0]?.total || 0;
      
//       // Get current inventory
//       const product = await Product.findById(item.productId).session(session);
//       const inventory = product?.inventory?.find(
//         inv => String(inv.branchId) === String(purchase.branchId)
//       );
      
//       const currentStock = inventory?.quantity || 0;
//       const netAvailable = currentStock - soldQty;
      
//       if (netAvailable < item.quantity) {
//         errors.push(
//           `Cannot cancel purchase for ${product?.name || item.productId}. ` +
//           `Only ${netAvailable} units available after sales, ${item.quantity} needed.`
//         );
//       }
//     }
    
//     return {
//       isValid: errors.length === 0,
//       errors
//     };
//   }
  
//   /**
//    * Get stock movement history
//    */
//   static async getStockMovement(productId, branchId, organizationId, days = 30) {
//     const startDate = new Date();
//     startDate.setDate(startDate.getDate() - days);
    
//     const [purchases, sales, returns] = await Promise.all([
//       // Purchases
//       mongoose.model('Purchase').aggregate([
//         { $match: {
//           organizationId: mongoose.Types.ObjectId(organizationId),
//           branchId: mongoose.Types.ObjectId(branchId),
//           status: { $ne: 'cancelled' },
//           purchaseDate: { $gte: startDate }
//         }},
//         { $unwind: '$items' },
//         { $match: { 'items.productId': mongoose.Types.ObjectId(productId) } },
//         { $group: {
//           _id: null,
//           total: { $sum: '$items.quantity' },
//           count: { $sum: 1 }
//         }}
//       ]),
      
//       // Sales
//       mongoose.model('Sales').aggregate([
//         { $match: {
//           organizationId: mongoose.Types.ObjectId(organizationId),
//           branchId: mongoose.Types.ObjectId(branchId),
//           status: { $ne: 'cancelled' },
//           createdAt: { $gte: startDate }
//         }},
//         { $unwind: '$items' },
//         { $match: { 'items.productId': mongoose.Types.ObjectId(productId) } },
//         { $group: {
//           _id: null,
//           total: { $sum: '$items.qty' },
//           count: { $sum: 1 }
//         }}
//       ]),
      
//       // Returns (sales returns)
//       mongoose.model('SalesReturn').aggregate([
//         { $match: {
//           organizationId: mongoose.Types.ObjectId(organizationId),
//           branchId: mongoose.Types.ObjectId(branchId),
//           status: 'approved',
//           createdAt: { $gte: startDate }
//         }},
//         { $unwind: '$items' },
//         { $match: { 'items.productId': mongoose.Types.ObjectId(productId) } },
//         { $group: {
//           _id: null,
//           total: { $sum: '$items.quantity' },
//           count: { $sum: 1 }
//         }}
//       ])
//     ]);
    
//     return {
//       purchases: purchases[0]?.total || 0,
//       purchaseCount: purchases[0]?.count || 0,
//       sales: sales[0]?.total || 0,
//       salesCount: sales[0]?.count || 0,
//       returns: returns[0]?.total || 0,
//       returnCount: returns[0]?.count || 0
//     };
//   }
  
//   /**
//    * Get stock value at cost
//    */
//   static async getStockValue(branchId, organizationId) {
//     const products = await Product.find({
//       organizationId,
//       isActive: true
//     }).populate('inventory');
    
//     let totalValue = 0;
    
//     for (const product of products) {
//       const inventory = product.inventory.find(
//         inv => String(inv.branchId) === String(branchId)
//       );
      
//       if (inventory && inventory.quantity > 0) {
//         totalValue += inventory.quantity * (product.purchasePrice || 0);
//       }
//     }
    
//     return totalValue;
//   }
// }

// module.exports = StockValidationService;


