const { z } = require('zod');

exports.dateRangeSchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  status: z.string().optional(),
  departmentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Department ID').optional(),
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid User ID').optional()
});

exports.regularizeSchema = z.object({
  firstIn: z.string().datetime().nullable().optional(),
  lastOut: z.string().datetime().nullable().optional(),
  status: z.enum(['present', 'absent', 'half_day', 'late', 'on_leave', 'week_off', 'holiday', 'work_from_home', 'on_duty']).optional(),
  reason: z.string().min(2, 'Please provide a valid regularization reason')
});

exports.bulkUpdateSchema = z.object({
  updates: z.array(z.object({
    userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
    date: z.string().datetime(),
    status: z.enum(['present', 'absent', 'half_day', 'late', 'on_leave', 'week_off', 'holiday', 'work_from_home', 'on_duty']).optional(),
    firstIn: z.string().datetime().optional(),
    lastOut: z.string().datetime().optional(),
    totalWorkHours: z.number().min(0).optional(),
    overtimeHours: z.number().min(0).optional(),
    notes: z.string().optional()
  })).min(1, 'Please provide an array of updates')
});

exports.recalculateSchema = z.object({
  date: z.string().datetime()
});