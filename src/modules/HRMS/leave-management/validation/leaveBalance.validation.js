const { z } = require('zod');
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const leaveFieldSchema = z.object({
  total: z.number().min(0, 'Total cannot be negative'),
  used: z.number().min(0, 'Used cannot be negative')
}).refine(data => data.used <= data.total, { message: 'Used cannot exceed total' });

exports.updateBalanceSchema = z.object({
  casualLeave: leaveFieldSchema.optional(),
  sickLeave: leaveFieldSchema.optional(),
  earnedLeave: leaveFieldSchema.optional(),
  compensatoryOff: leaveFieldSchema.optional(),
  reason: z.string().optional().default('Manual adjustment by admin')
}).refine(data => Object.keys(data).length > 1, { message: 'Provide at least one leave type to update' });

exports.initializeBalanceSchema = z.object({
  userId: z.string().regex(objectIdRegex),
  financialYear: z.string().optional()
});

exports.bulkInitializeSchema = z.object({
  financialYear: z.string().optional(),
  carryForward: z.boolean().default(true)
});

exports.accrueLeaveSchema = z.object({
  month: z.number().min(1).max(12),
  year: z.number().min(2000).max(2100)
});

exports.reportQuerySchema = z.object({
  financialYear: z.string().optional(),
  departmentId: z.string().regex(objectIdRegex).optional()
});