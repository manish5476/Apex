// src/routes/salesRoutes.js
const express = require('express');
const router = express.Router();
const salesController = require('../../controllers/salesController');
const authController = require('../../controllers/authController');

router.use(authController.protect); 

router.post('/', salesController.create); 
router.get('/', salesController.list);
router.get('/:id', salesController.get);
router.put('/:id', salesController.update);
router.delete('/:id', salesController.remove);

// create from invoice (convenience)
router.post('/from-invoice/:invoiceId', salesController.createFromInvoice);

module.exports = router;
