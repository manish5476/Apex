// src/routes/salesRoutes.js
const express = require('express');
const router = express.Router();
const salesController = require('../../controllers/salesController');
const authController = require('../../controllers/authController');

// Public or protected as per your app—most likely protected
router.use(authController.protect); // require auth for all operations

router.post('/', salesController.create); // create manual sales
router.get('/', salesController.list);
router.get('/:id', salesController.get);
router.put('/:id', salesController.update);
router.delete('/:id', salesController.remove);

// create from invoice (convenience)
router.post('/from-invoice/:invoiceId', salesController.createFromInvoice);

module.exports = router;
