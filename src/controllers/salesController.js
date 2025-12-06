// src/controllers/salesController.js
const SalesService = require('../services/salesService');
const { createSalesSchema, updateSalesSchema } = require('../validations/salesValidation');

const create = async (req, res, next) => {
  try {
    // 1. Validate User Input (req.body only)
    const { error, value } = createSalesSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    // 2. Inject System Fields (Org, Branch, User)
    const salesData = {
      ...value,
      organizationId: req.user.organizationId, // Forced from token
      branchId: req.user.branchId,             // Forced from token
      createdBy: req.user._id
    };

    // 3. Create
    const doc = await SalesService.create(salesData);
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

const createFromInvoice = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    
    // Pass organizationId to service to ensure we only look for invoices in THIS org
    const sales = await SalesService.createFromInvoice(invoiceId, req.user.organizationId);
    
    res.status(201).json({ success: true, data: sales });
  } catch (err) {
    next(err);
  }
};

const get = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await SalesService.getById(id);

    if (!doc) return res.status(404).json({ success: false, message: 'Sales record not found' });

    // SECURITY: Ensure record belongs to the user's organization
    if (doc.organizationId.toString() !== req.user.organizationId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    // 1. Force Organization Filter
    const filter = { 
      organizationId: req.user.organizationId 
    };

    // 2. Map Query Params to Schema Fields
    if (req.query.customer) filter.customerId = req.query.customer;
    if (req.query.invoice) filter.invoiceId = req.query.invoice;
    
    // Optional: Filter by Branch (if provided) or default to user's branch if desired
    if (req.query.branch) filter.branchId = req.query.branch;

    const options = { 
      limit: parseInt(req.query.limit) || 50, 
      page: parseInt(req.query.page) || 1,
      sort: { createdAt: -1 } // Newest first
    };

    const result = await SalesService.list(filter, options);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Security Check: Get existing doc first
    const existingDoc = await SalesService.getById(id);
    if (!existingDoc) return res.status(404).json({ success: false, message: 'Sales record not found' });
    
    if (existingDoc.organizationId.toString() !== req.user.organizationId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized action' });
    }

    // 2. Validate Update Payload
    const { error, value } = updateSalesSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    // 3. Update
    const updated = await SalesService.update(id, value);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Security Check
    const existingDoc = await SalesService.getById(id);
    if (!existingDoc) return res.status(404).json({ success: false, message: 'Sales record not found' });

    if (existingDoc.organizationId.toString() !== req.user.organizationId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized action' });
    }

    // 2. Remove
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

// // src/controllers/salesController.js
// const SalesService = require('../services/salesService');
// const { createSalesSchema, updateSalesSchema } = require('../validations/salesValidation');
// const Joi = require('joi');

// const create = async (req, res, next) => {
//   try {
//     const payload = req.body;
//     const { error, value } = createSalesSchema.validate(payload);
//     if (error) return res.status(400).json({ success: false, message: error.message });

//     value.createdBy = req.user ? req.user._id : value.createdBy;
//     const doc = await SalesService.create(value);
//     return res.status(201).json({ success: true, data: doc });
//   } catch (err) {
//     next(err);
//   }
// };

// const createFromInvoice = async (req, res, next) => {
//   try {
//     const { invoiceId } = req.params;
//     const sales = await SalesService.createFromInvoice(invoiceId);
//     res.status(201).json({ success: true, data: sales });
//   } catch (err) {
//     next(err);
//   }
// };

// const get = async (req, res, next) => {
//   try {
//     const { id } = req.params;
//     const doc = await SalesService.getById(id);
//     if (!doc) return res.status(404).json({ success: false, message: 'Sales not found' });
//     res.json({ success: true, data: doc });
//   } catch (err) {
//     next(err);
//   }
// };

// const list = async (req, res, next) => {
//   try {
//     const filter = {};
//     if (req.query.customer) filter.customer = req.query.customer;
//     if (req.query.invoice) filter.invoice = req.query.invoice;
//     if (req.query.branch) filter.branch = req.query.branch;
//     const options = { limit: parseInt(req.query.limit) || 50, page: parseInt(req.query.page) || 1 };
//     const result = await SalesService.list(filter, options);
//     res.json({ success: true, ...result });
//   } catch (err) {
//     next(err);
//   }
// };

// const update = async (req, res, next) => {
//   try {
//     const { id } = req.params;
//     const payload = req.body;
//     const { error } = updateSalesSchema.validate(payload);
//     if (error) return res.status(400).json({ success: false, message: error.message });

//     const updated = await SalesService.update(id, payload);
//     res.json({ success: true, data: updated });
//   } catch (err) {
//     next(err);
//   }
// };

// const remove = async (req, res, next) => {
//   try {
//     const { id } = req.params;
//     const removed = await SalesService.remove(id);
//     res.json({ success: true, data: removed });
//   } catch (err) {
//     next(err);
//   }
// };

// module.exports = {
//   create,
//   createFromInvoice,
//   get,
//   list,
//   update,
//   remove
// };
