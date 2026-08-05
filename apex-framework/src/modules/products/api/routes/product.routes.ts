const express = require('express');
const router = express.Router();

const controller = require('../controllers/product.controller');
const { validateCreate, validateUpdate, validateStock } = require('../validators/product.validator');
// const { authenticate } = require('../../../../core/auth'); // wire in when auth module exists

router.get('/search', controller.search);
router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', validateCreate, controller.create);
router.patch('/:id', validateUpdate, controller.update);
router.patch('/:id/reduce-stock', validateStock, controller.reduceStock);
router.delete('/:id', controller.remove);

module.exports = router;
