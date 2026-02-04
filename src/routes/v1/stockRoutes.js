const express = require('express');
const router = express.Router();
// Note: stockController may need to be located or created
const stockController = require('../../modules/inventory/core/inventory.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission, } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require('../../config/permissions');

// Protect all routes
router.use(authController.protect);

// Add checkPermission to all routes:
// router.get('/branch/:branchId', 
//   checkPermission(PERMISSIONS.STOCK.READ), 
//   stockController.getBranchStock
// );

// router.get('/movement/:productId', 
//   checkPermission(PERMISSIONS.STOCK.READ), 
//   stockController.getStockMovement
// );

// router.get('/low-stock', 
//   checkPermission(PERMISSIONS.STOCK.LOW_STOCK), 
//   stockController.getLowStock
// );

// router.get('/value', 
//   checkPermission(PERMISSIONS.STOCK.READ), 
//   stockController.getStockValue
// );

// router.get('/aging', 
//   checkPermission(PERMISSIONS.STOCK.READ), 
//   stockController.getStockAging
// );

// router.put('/reorder-level/:productId', 
//   checkPermission(PERMISSIONS.STOCK.MANAGE), 
//   stockController.updateReorderLevel
// );

router.post('/transfer', 
  checkPermission(PERMISSIONS.STOCK.MANAGE), 
  stockController.transferStock
);
module.exports = router;