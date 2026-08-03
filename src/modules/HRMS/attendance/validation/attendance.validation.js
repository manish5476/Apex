const { z } = require('zod');

// Schema for Web/Mobile manual punches
exports.punchSchema = z.object({
  type: z.enum(['in', 'out', 'break_start', 'break_end', 'remote_in', 'remote_out', 'overtime_in', 'overtime_out']),
  timestamp: z.coerce.date().default(() => new Date()), // Converts string to Date, defaults to now
  location: z.object({
    geoJson: z.object({
      type: z.literal('Point').default('Point'),
      coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) // [longitude, latitude]
    }).optional(),
    accuracy: z.number().optional(),
    address: z.string().optional()
  }).optional()
});

// Schema for Machine Bulk Sync (Array of logs)
exports.bulkMachineSyncSchema = z.object({
  logs: z.array(z.object({
    userId: z.string(), // This is the Machine's internal ID, NOT the Mongo ObjectId
    type: z.enum(['in', 'out', 'break_start', 'break_end']),
    timestamp: z.coerce.date(),
    biometricData: z.object({
      templateId: z.string().optional(),
      method: z.enum(['fingerprint', 'face', 'iris', 'palm']).optional()
    }).optional()
  })).max(500, 'Cannot sync more than 500 logs at once')
});