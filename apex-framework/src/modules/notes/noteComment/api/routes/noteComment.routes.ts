const express = require('express');
const router = express.Router();

const controller = require('../controllers/noteComment.controller');
const { validateCreate, validateUpdate } = require('../validators/noteComment.validator');

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', validateCreate, controller.create);
router.patch('/:id', validateUpdate, controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
