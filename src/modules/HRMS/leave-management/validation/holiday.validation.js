const { z } = require('zod');
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const holidayBaseSchema = z.object({
  name: z.string().min(2, 'Holiday name is required').trim(),
  date: z.coerce.date(),
  branchId: z.string().regex(objectIdRegex, 'Invalid Branch ID').nullable().optional(), // null = org-wide
  description: z.string().optional(),
  holidayType: z.enum(['national', 'state', 'festival', 'company', 'restricted']).default('company'),
  isOptional: z.boolean().default(false),
  recurring: z.object({
    isRecurring: z.boolean().default(false),
    frequency: z.enum(['yearly', 'monthly']).default('yearly'),
    endYear: z.number().min(2000).max(2100).optional()
  }).optional(),
  applicableTo: z.object({
    departments: z.array(z.string().regex(objectIdRegex)).optional(),
    employmentTypes: z.array(z.enum(['permanent', 'contract', 'intern', 'all'])).optional(),
    allEmployees: z.boolean().default(true)
  }).optional(),
  isActive: z.boolean().default(true)
});

exports.createHolidaySchema = holidayBaseSchema;
exports.updateHolidaySchema = holidayBaseSchema.partial();

exports.checkDateSchema = z.object({
  date: z.coerce.date(),
  branchId: z.string().regex(objectIdRegex).optional()
});

exports.bulkCreateSchema = z.object({
  year: z.number().min(2000).max(2100).optional(),
  holidays: z.array(holidayBaseSchema).min(1, 'Please provide an array of holidays')
});

exports.copyYearSchema = z.object({
  fromYear: z.number().min(2000).max(2100),
  toYear: z.number().min(2000).max(2100),
  branchId: z.string().regex(objectIdRegex).optional()
});