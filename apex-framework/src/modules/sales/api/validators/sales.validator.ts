import Joi from 'joi';
import mongoose from 'mongoose';

const objectId = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) return helpers.error('any.invalid');
  return value;
}, 'ObjectId validation');

const salesItem = Joi.object({
  productId: objectId.required(),
  sku: Joi.string().allow('', null),
  name: Joi.string().allow('', null),
  qty: Joi.number().integer().min(0).required(),
  rate: Joi.number().min(0).required(),
  discount: Joi.number().min(0).default(0),
  tax: Joi.number().min(0).default(0),
  lineTotal: Joi.number().min(0).required(),
});

export const createSalesSchema = Joi.object({
  invoiceId: objectId.required(), 
  invoiceNumber: Joi.string().allow('', null), 
  customerId: objectId.required(), 
  branchId: objectId.optional(), 
  items: Joi.array().items(salesItem).min(1).required(),
  subTotal: Joi.number().min(0).default(0),
  taxTotal: Joi.number().min(0).default(0),
  discountTotal: Joi.number().min(0).default(0),
  totalAmount: Joi.number().min(0).required(),
  paidAmount: Joi.number().min(0).default(0),
  dueAmount: Joi.number().min(0).default(0),
  paymentStatus: Joi.string().valid('unpaid', 'partial', 'paid', 'refunded').default('unpaid'),
  status: Joi.string().valid('active', 'cancelled', 'returned').default('active'),
  createdBy: objectId.optional(),
  meta: Joi.object().optional(),
});

export const updateSalesSchema = createSalesSchema.fork(['items', 'totalAmount'], (s) => s.optional());