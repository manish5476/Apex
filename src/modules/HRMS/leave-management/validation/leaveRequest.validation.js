const { z } = require('zod');
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const validLeaveTypes = ['casual', 'sick', 'earned', 'compensatory', 'paid', 'unpaid', 'marriage', 'paternity', 'maternity', 'bereavement', 'study', 'sabbatical'];

exports.createLeaveRequestSchema = z.object({
  leaveType: z.enum(validLeaveTypes),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  daysCount: z.number().min(0.5),
  startSession: z.enum(['full', 'first_half', 'second_half']).default('full'),
  endSession: z.enum(['full', 'first_half', 'second_half']).default('full'),
  reason: z.string().min(2, 'Please provide a valid reason'),
  assignedApprover: z.string().regex(objectIdRegex, 'Invalid Approver ID'),
  additionalNotes: z.string().optional(),
  handoverTo: z.string().regex(objectIdRegex).optional(),
  handoverNotes: z.string().optional()
}).refine(data => new Date(data.endDate) >= new Date(data.startDate), {
  message: 'End date must be on or after start date',
  path: ['endDate']
});

exports.updateLeaveRequestSchema = exports.createLeaveRequestSchema.partial().omit({ assignedApprover: true });

exports.actionSchema = z.object({
  comments: z.string().optional()
});

exports.rejectSchema = z.object({
  reason: z.string().min(2, 'Rejection reason is required')
});

exports.escalateSchema = z.object({
  escalateTo: z.string().regex(objectIdRegex),
  reason: z.string().optional()
});

exports.bulkApproveSchema = z.object({
  requestIds: z.array(z.string().regex(objectIdRegex)).min(1),
  comments: z.string().optional()
});