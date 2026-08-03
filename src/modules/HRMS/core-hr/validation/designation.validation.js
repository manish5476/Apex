const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const designationBaseSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').trim(),
  code: z.string().trim().toUpperCase().optional(),
  description: z.string().optional(),
  level: z.number().min(1).default(1),
  grade: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).default('C'),
  nextDesignation: z.string().regex(objectIdRegex, 'Invalid Next Designation ID').nullable().optional(),
  promotionAfterYears: z.number().min(0).optional(),
  jobFamily: z.string().optional(),
  responsibilities: z.array(z.string()).optional(),
  qualifications: z.array(z.string()).optional(),
  experienceRequired: z.number().min(0).optional(),
  salaryBand: z.object({
    min: z.number().min(0),
    max: z.number().min(0),
    currency: z.string().default('INR')
  }).optional(),
  reportsTo: z.array(z.string().regex(objectIdRegex)).optional(),
  isActive: z.boolean().default(true),
  metadata: z.object({
    isManager: z.boolean().default(false),
    isExecutive: z.boolean().default(false),
    requiresApproval: z.boolean().default(false)
  }).optional()
}).superRefine((data, ctx) => {
  // Enforce min/max salary logic at the schema level
  if (data.salaryBand && data.salaryBand.min > data.salaryBand.max) {
    ctx.addIssue({
      path: ['salaryBand', 'min'],
      code: z.ZodIssueCode.custom,
      message: 'salaryBand.min cannot exceed salaryBand.max',
    });
  }
});

exports.createDesignationSchema = designationBaseSchema;
exports.updateDesignationSchema = designationBaseSchema.partial();