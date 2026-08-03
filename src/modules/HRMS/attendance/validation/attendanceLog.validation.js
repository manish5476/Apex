const { z } = require('zod');

exports.manualPunchSchema = z.object({
  type: z.enum(['in', 'out', 'break_start', 'break_end', 'remote_in', 'remote_out', 'overtime_in', 'overtime_out']),
  timestamp: z.string().datetime().optional(), // Coerced to now if omitted
  location: z.object({
    geoJson: z.object({
      type: z.literal('Point').default('Point'),
      coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) // [lng, lat]
    }).optional(),
    accuracy: z.number().optional(),
    address: z.string().optional()
  }).optional()
});

exports.bulkMachineLogsSchema = z.object({
  logs: z.array(z.object({
    userId: z.string(), // Machine internal ID
    type: z.enum(['in', 'out', 'break_start', 'break_end', 'overtime_in', 'overtime_out']),
    timestamp: z.string().datetime(),
    biometricData: z.object({
      templateId: z.string().optional(),
      confidence: z.number().min(0).max(100).optional(),
      method: z.enum(['fingerprint', 'face', 'iris', 'palm']).optional()
    }).optional()
  })).min(1).max(500, 'Cannot sync more than 500 logs at once')
});

exports.flagLogSchema = z.object({
  reason: z.string().min(2, 'Please provide a valid reason')
});

exports.correctLogSchema = z.object({
  timestamp: z.string().datetime(),
  type: z.enum(['in', 'out', 'break_start', 'break_end', 'remote_in', 'remote_out', 'overtime_in', 'overtime_out']),
  reason: z.string().min(2, 'Please provide a correction reason')
});