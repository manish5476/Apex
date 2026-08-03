const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

exports.createRequestSchema = z.object({
  targetDate: z.string().datetime(),
  type: z.enum(['missed_punch', 'correction', 'work_from_home', 'on_duty', 'overtime', 'regularization', 'others']),
  assignedApprover: z.string().regex(objectIdRegex, 'Invalid Approver ID'),
  correction: z.object({
    newFirstIn: z.string().datetime().optional(),
    newLastOut: z.string().datetime().optional(),
    reason: z.string().min(2, 'Please provide a reason for correction')
  }).optional()
}).superRefine((data, ctx) => {
  if (data.type === 'correction' && !data.correction) {
    ctx.addIssue({
      path: ['correction'],
      code: z.ZodIssueCode.custom,
      message: 'Correction details are required when type is "correction"',
    });
  }
});

exports.approveRequestSchema = z.object({
  comments: z.string().optional()
});

exports.rejectRequestSchema = z.object({
  reason: z.string().min(2, 'Rejection reason is required')
});