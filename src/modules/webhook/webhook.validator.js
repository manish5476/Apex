const { z } = require('zod');

const VALID_EVENTS = [
  'invoice.created', 'invoice.updated',
  'payment.received', 'stock.low',
  'customer.created', 'customer.updated'
];

// URL must be HTTPS in production
const urlSchema = z.string().url().refine(
  url => process.env.NODE_ENV !== 'production' || url.startsWith('https://'),
  { message: 'Webhook URL must use HTTPS in production' }
);

exports.createWebhookSchema = z.object({
  name:   z.string().min(1).max(100),
  url:    urlSchema,
  secret: z.string().min(16).max(256),
  events: z.array(z.enum(VALID_EVENTS)).min(1),
});

exports.updateWebhookSchema = z.object({
  name:     z.string().min(1).max(100).optional(),
  url:      urlSchema.optional(),
  secret:   z.string().min(16).max(256).optional(),
  events:   z.array(z.enum(VALID_EVENTS)).min(1).optional(),
  isActive: z.boolean().optional(),
});

// Middleware factory
exports.validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ 
      status: 'fail', 
      errors: result.error.flatten().fieldErrors 
    });
  }
  req.body = result.data; // Sanitized
  next();
};