const express = require('express');
const router = express.Router();
const stockController = require('../../controllers/stockController');
const authController = require('../../controllers/authController');
const { checkPermission, } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require('../../config/permissions');

// Protect all routes
router.use(authController.protect);

// Add checkPermission to all routes:
router.get('/branch/:branchId', 
  checkPermission(PERMISSIONS.STOCK.READ), 
  stockController.getBranchStock
);

router.get('/movement/:productId', 
  checkPermission(PERMISSIONS.STOCK.READ), 
  stockController.getStockMovement
);

router.get('/low-stock', 
  checkPermission(PERMISSIONS.STOCK.LOW_STOCK), 
  stockController.getLowStock
);

router.get('/value', 
  checkPermission(PERMISSIONS.STOCK.READ), 
  stockController.getStockValue
);

router.get('/aging', 
  checkPermission(PERMISSIONS.STOCK.READ), 
  stockController.getStockAging
);

router.put('/reorder-level/:productId', 
  checkPermission(PERMISSIONS.STOCK.MANAGE), 
  stockController.updateReorderLevel
);

router.post('/transfer', 
  checkPermission(PERMISSIONS.STOCK.MANAGE), 
  stockController.transferStock
);
module.exports = router;