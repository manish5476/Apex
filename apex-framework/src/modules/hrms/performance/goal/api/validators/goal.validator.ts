const { z } = require('zod');
const ApiError = require('../../../../../../core/ApiError');

const createSchema = z.object({
  name: z.string().min(2).max(200),
  // TODO: add Goal-specific fields
});

const updateSchema = createSchema.partial();

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
};
