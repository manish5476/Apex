const { z } = require('zod');
const ApiError = require('../../../../core/ApiError');

const createSchema = z.object({
  name: z.string().min(2).max(200),
  sku: z.string().min(2).max(50),
  price: z.number().nonnegative(),
  stock: z.number().int().nonnegative().default(0),
  category: z.string().optional(),
});

const updateSchema = createSchema.partial();

const stockSchema = z.object({
  quantity: z.number().int().positive(),
});

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(ApiError.badRequest('Validation failed', result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  validateCreate: validate(createSchema),
  validateUpdate: validate(updateSchema),
  validateStock: validate(stockSchema),
};
