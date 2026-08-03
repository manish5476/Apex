const { z } = require('zod');

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeMessage = 'Invalid time format. Use HH:MM (e.g., 09:00)';
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const breakSchema = z.object({
  name: z.string().optional(),
  startTime: z.string().regex(timeRegex, timeMessage).optional(),
  endTime: z.string().regex(timeRegex, timeMessage).optional(),
  isPaid: z.boolean().default(false)
});

const shiftBaseSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
  code: z.string().min(2).trim().toUpperCase().optional(),
  description: z.string().optional(),
  startTime: z.string().regex(timeRegex, timeMessage).default('09:00'),
  endTime: z.string().regex(timeRegex, timeMessage).default('18:00'),
  breakDurationMins: z.number().min(0).default(60),
  breaks: z.array(breakSchema).optional(),
  gracePeriodMins: z.number().min(0).default(15),
  lateThresholdMins: z.number().min(0).default(30),
  earlyDepartureThresholdMins: z.number().min(0).default(15),
  halfDayThresholdHrs: z.number().min(0).default(4),
  minFullDayHrs: z.number().min(0).default(8),
  maxOvertimeHrs: z.number().min(0).default(4),
  shiftType: z.enum(['fixed', 'rotating', 'flexi', 'split', 'night']).default('fixed'),
  weeklyOffs: z.array(z.number().min(0).max(6)).default([0]),
  applicableDays: z.array(z.number().min(0).max(6)).optional(),
  overtimeRules: z.object({
    enabled: z.boolean().default(false),
    multiplier: z.number().min(1).default(1.5),
    afterHours: z.number().min(0).default(8),
    doubleAfterHours: z.number().min(0).default(12),
    holidayMultiplier: z.number().min(1).default(2.0)
  }).optional(),
  isActive: z.boolean().default(true)
});

exports.createShiftSchema = shiftBaseSchema;
exports.updateShiftSchema = shiftBaseSchema.partial();

exports.calcHoursSchema = z.object({
  startTime: z.string().regex(timeRegex, timeMessage),
  endTime: z.string().regex(timeRegex, timeMessage),
  breaks: z.array(breakSchema).optional()
});

exports.validateAssignmentSchema = z.object({
  shiftId: z.string().regex(objectIdRegex),
  userId: z.string().regex(objectIdRegex),
  date: z.string().datetime().optional()
});