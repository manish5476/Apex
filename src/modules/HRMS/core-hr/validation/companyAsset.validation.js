const { z } = require('zod');
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const assetBaseSchema = z.object({
  branchId: z.string().regex(objectIdRegex).optional(),
  assetCode: z.string().min(2).trim().toUpperCase(),
  name: z.string().min(2).trim(),
  category: z.enum(['laptop', 'mobile', 'tablet', 'vehicle', 'tool', 'access_card', 'furniture', 'other']),
  serialNumber: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  model: z.string().trim().optional(),
  purchaseDate: z.coerce.date().optional(),
  purchaseCost: z.number().min(0).optional(),
  warrantyExpiresAt: z.coerce.date().optional(),
  condition: z.enum(['new', 'good', 'fair', 'repair_needed', 'damaged', 'lost']).default('good'),
});

exports.createAssetSchema = assetBaseSchema;
exports.updateAssetSchema = assetBaseSchema.partial();

exports.assignAssetSchema = z.object({
  userId: z.string().regex(objectIdRegex, 'Invalid User ID'),
  employeeId: z.string().regex(objectIdRegex, 'Invalid Employee ID'),
  notes: z.string().optional()
});

exports.returnAssetSchema = z.object({
  conditionOnReturn: z.enum(['new', 'good', 'fair', 'repair_needed', 'damaged', 'lost']),
  notes: z.string().optional()
});