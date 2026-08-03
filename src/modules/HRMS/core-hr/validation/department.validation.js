const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const departmentBaseSchema = z.object({
  name: z.string().min(2, 'Department name must be at least 2 characters').trim(),
  code: z.string().trim().toUpperCase().optional(),
  description: z.string().optional(),
  branchId: z.string().regex(objectIdRegex, 'Invalid Branch ID').optional(),
  parentDepartment: z.string().regex(objectIdRegex, 'Invalid Parent Department ID').nullable().optional(),
  headOfDepartment: z.string().regex(objectIdRegex, 'Invalid HOD User ID').nullable().optional(),
  assistantHOD: z.string().regex(objectIdRegex, 'Invalid Assistant HOD User ID').nullable().optional(),
  costCenter: z.string().optional(),
  budgetCode: z.string().optional(),
  maxStrength: z.number().min(1).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  location: z.string().optional(),
  isActive: z.boolean().default(true),
});

exports.createDepartmentSchema = departmentBaseSchema;

// Make all fields optional for updates
exports.updateDepartmentSchema = departmentBaseSchema.partial();