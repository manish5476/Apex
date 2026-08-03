const { z } = require('zod');
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const geoFenceBaseSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
  code: z.string().min(2).trim().toUpperCase(),
  branchId: z.string().regex(objectIdRegex, 'Invalid Branch ID').optional(),
  type: z.enum(['circle', 'polygon', 'building', 'custom']).default('circle'),
  center: z.object({
    type: z.literal('Point').default('Point'),
    coordinates: z.tuple([
      z.number().min(-180).max(180), // Longitude
      z.number().min(-90).max(90)    // Latitude
    ])
  }).optional(),
  radius: z.number().min(10).max(10000).optional(),
  polygon: z.object({
    type: z.literal('Polygon').default('Polygon'),
    coordinates: z.array(z.array(z.array(z.number()))) // [[[lng, lat], ...]]
  }).optional(),
  address: z.object({
    line1: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional()
  }).optional(),
  allowedEntryTypes: z.enum(['in', 'out', 'both']).default('both'),
  applicableToAll: z.boolean().default(true),
  isActive: z.boolean().default(true)
}).superRefine((data, ctx) => {
  if (data.type === 'circle' && (!data.center || !data.radius)) {
    ctx.addIssue({ path: ['center'], code: z.ZodIssueCode.custom, message: 'Circle requires center coordinates and radius' });
  }
  if (data.type === 'polygon' && (!data.polygon || !data.polygon.coordinates.length)) {
    ctx.addIssue({ path: ['polygon'], code: z.ZodIssueCode.custom, message: 'Polygon requires valid coordinates' });
  }
});

exports.createGeoFenceSchema = geoFenceBaseSchema;
exports.updateGeoFenceSchema = geoFenceBaseSchema.partial();

exports.pointCheckSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  radius: z.number().min(10).max(10000).optional() // used for nearby
});

exports.assignUsersSchema = z.object({
  userIds: z.array(z.string().regex(objectIdRegex)).min(1)
});

exports.assignDepartmentsSchema = z.object({
  departmentIds: z.array(z.string().regex(objectIdRegex)).min(1),
  replace: z.boolean().default(false)
});