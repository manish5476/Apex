const { z } = require('zod');
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const shiftGroupBaseSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
  code: z.string().min(2).trim().toUpperCase(),
  description: z.string().optional(),
  branchId: z.string().regex(objectIdRegex).optional(),
  shifts: z.array(z.object({
    shiftId: z.string().regex(objectIdRegex),
    sequence: z.number().min(1).optional(),
    color: z.string().optional()
  })).min(1, 'A shift group must contain at least one shift'),
  rotationType: z.enum(['daily', 'weekly', 'monthly', 'custom']).default('weekly'),
  rotationPattern: z.array(z.object({
    dayOffset: z.number().min(0),
    shiftId: z.string().regex(objectIdRegex)
  })).optional(),
  applicableDepartments: z.array(z.string().regex(objectIdRegex)).optional(),
  applicableDesignations: z.array(z.string().regex(objectIdRegex)).optional(),
  isActive: z.boolean().default(true),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional()
});

exports.createShiftGroupSchema = shiftGroupBaseSchema;
exports.updateShiftGroupSchema = shiftGroupBaseSchema.partial();

exports.generateScheduleSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  userIds: z.array(z.string().regex(objectIdRegex)).optional()
}).refine(data => {
  const days = Math.ceil((new Date(data.endDate) - new Date(data.startDate)) / (1000 * 60 * 60 * 24)) + 1;
  return days > 0 && days <= 365;
}, { message: 'Schedule generation must be between 1 and 365 days' });

exports.assignGroupSchema = z.object({
  userIds: z.array(z.string().regex(objectIdRegex)).min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional().nullable()
});