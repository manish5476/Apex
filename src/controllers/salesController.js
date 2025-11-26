// src/controllers/salesController.js
const SalesService = require('../services/salesService');
const { createSalesSchema, updateSalesSchema } = require('../validations/salesValidation');
const Joi = require('joi');

const create = async (req, res, next) => {
  try {
    const payload = req.body;
    const { error, value } = createSalesSchema.validate(payload);
    if (error) return res.status(400).json({ success: false, message: error.message });

    value.createdBy = req.user ? req.user._id : value.createdBy;
    const doc = await SalesService.create(value);
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

const createFromInvoice = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const sales = await SalesService.createFromInvoice(invoiceId);
    res.status(201).json({ success: true, data: sales });
  } catch (err) {
    next(err);
  }
};

const get = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await SalesService.getById(id);
    if (!doc) return res.status(404).json({ success: false, message: 'Sales not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.customer) filter.customer = req.query.customer;
    if (req.query.invoice) filter.invoice = req.query.invoice;
    if (req.query.branch) filter.branch = req.query.branch;
    const options = { limit: parseInt(req.query.limit) || 50, page: parseInt(req.query.page) || 1 };
    const result = await SalesService.list(filter, options);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    const { error } = updateSalesSchema.validate(payload);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const updated = await SalesService.update(id, payload);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    const removed = await SalesService.remove(id);
    res.json({ success: true, data: removed });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  create,
  createFromInvoice,
  get,
  list,
  update,
  remove
};
