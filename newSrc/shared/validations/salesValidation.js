const Joi = require('joi');
const mongoose = require('mongoose');

const objectId = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) return helpers.error('any.invalid');
  return value;
}, 'ObjectId validation');

const salesItem = Joi.object({
  productId: objectId.required(), // ✅ FIXED: Was 'product'
  sku: Joi.string().allow('', null),
  name: Joi.string().allow('', null),
  qty: Joi.number().integer().min(0).required(),
  rate: Joi.number().min(0).required(),
  discount: Joi.number().min(0).default(0),
  tax: Joi.number().min(0).default(0),
  lineTotal: Joi.number().min(0).required(),
});

const createSalesSchema = Joi.object({
  // ✅ FIXED: Field names now match Mongoose Schema (invoiceId, customerId)
  invoiceId: objectId.required(), // Required by Model, so Joi must enforce it
  invoiceNumber: Joi.string().allow('', null), // Changed from invoiceNo to match schema
  
  customerId: objectId.required(), // Required by Model
  branchId: objectId.optional(),   // Optional in Body (Injected by Controller)
  
  items: Joi.array().items(salesItem).min(1).required(),
  
  subTotal: Joi.number().min(0).default(0),
  taxTotal: Joi.number().min(0).default(0),
  discountTotal: Joi.number().min(0).default(0),
  
  totalAmount: Joi.number().min(0).required(),
  paidAmount: Joi.number().min(0).default(0),
  dueAmount: Joi.number().min(0).default(0),
  
  paymentStatus: Joi.string().valid('unpaid','partial','paid','refunded').default('unpaid'),
  status: Joi.string().valid('active','cancelled','returned').default('active'),
  
  createdBy: objectId.optional(),
  meta: Joi.object().optional()
});

const updateSalesSchema = createSalesSchema.fork(['items','totalAmount'], (s) => s.optional());

module.exports = {
  createSalesSchema,
  updateSalesSchema
};