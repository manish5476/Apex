const express = require('express');
const router = express.Router();
const salesController = require('../../controllers/salesController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect); 
// Direct Sales Management
router.post('/', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.create); 
router.get('/', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.list);
router.post('/from-invoice/:invoiceId', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.createFromInvoice);
router.get('/:id', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.get);
router.put('/:id', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.update);
router.delete('/:id', checkPermission(PERMISSIONS.SALES.MANAGE), salesController.remove);
module.exports = router;
