const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

const recurrenceRuleSchema = z.object({
  frequency:      z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval:       z.number().int().min(1).max(365).default(1),
  daysOfWeek:     z.array(z.number().int().min(0).max(6)).optional(),
  endDate:        z.iso.datetime({ offset: true }).optional(),
  maxOccurrences: z.number().int().min(1).max(365).optional(),
});

const slaSchema = z.object({
  responseDeadline:   z.iso.datetime({ offset: true }).optional(),
  arrivalDeadline:    z.iso.datetime({ offset: true }).optional(),
  completionDeadline: z.iso.datetime({ offset: true }).optional(),
});

const inventoryItemSchema = z.object({
  productId: objectId,
  qty:       z.number().int().min(1),
});

const locationSchema = z.object({
  address: z.string().optional(),
  lat:     z.number().optional(),
  lng:     z.number().optional(),
});

// ── Create ──────────────────────────────────────────────────────────────────

exports.createWorkAssignmentSchema = z.object({
  title:                 z.string().min(2).max(200),
  description:           z.string().max(2000).optional(),
  internalNotes:         z.string().max(1000).optional(),
  status:                z.enum(['draft', 'scheduled']).default('draft'),
  priority:              z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),

  assignedTo:            z.array(objectId).max(20).optional(),
  customerId:            objectId.optional(),
  branchId:              objectId.optional(),

  requiredSkills:        z.array(objectId).max(20).optional(),

  location:              locationSchema.optional(),
  travelTimeEstimateMins: z.number().int().min(0).max(1440).optional(),

  scheduledAt:           z.iso.datetime({ offset: true }).optional(),
  estimatedDurationMins: z.number().int().min(1).max(2880).optional(),

  sla:                   slaSchema.optional(),
  inventoryItems:        z.array(inventoryItemSchema).max(50).optional(),
  recurrenceRule:        recurrenceRuleSchema.optional(),
});

// ── Update ───────────────────────────────────────────────────────────────────

exports.updateWorkAssignmentSchema = exports.createWorkAssignmentSchema
  .partial()
  .extend({
    scope: z.enum(['single', 'future', 'all']).default('single'),
  });

// ── Status transition ────────────────────────────────────────────────────────

const ALL_STATUSES = [
  'draft', 'scheduled', 'assigned', 'accepted', 'travelling',
  'arrived', 'working', 'paused', 'waiting_customer', 'waiting_parts',
  'testing', 'completed', 'verified', 'closed', 'cancelled',
];

exports.updateStatusSchema = z.object({
  status: z.enum(ALL_STATUSES),
  scope:  z.enum(['single', 'future', 'all']).default('single'),
});

// ── Complete ─────────────────────────────────────────────────────────────────

exports.completeWorkAssignmentSchema = z.object({
  customerRating:       z.number().min(1).max(5).optional(),
  firstVisitResolution: z.boolean().optional(),
  delayReason:          z.string().max(500).optional(),
  internalNotes:        z.string().max(1000).optional(),
});
