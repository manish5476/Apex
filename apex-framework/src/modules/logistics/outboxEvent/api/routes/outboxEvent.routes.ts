const express = require('express');
const router = express.Router();

const controller = require('../controllers/outboxEvent.controller');
const { validateCreate, validateUpdate } = require('../validators/outboxEvent.validator');

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', validateCreate, controller.create);
router.patch('/:id', validateUpdate, controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
