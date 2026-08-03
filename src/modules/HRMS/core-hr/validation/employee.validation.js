const { z } = require('zod');

// Base schema for shared fields
const employeeBaseSchema = z.object({
  user: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid User ID'),
  branchId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Branch ID').optional(),
  departmentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Department ID').optional(),
  designationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Designation ID').optional(),
  reportingManagerId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Manager ID').optional(),
  employeeId: z.string().min(2).max(50),
  employmentType: z.enum(['permanent', 'contract', 'intern', 'probation', 'consultant']).default('permanent'),
  workMode: z.enum(['office', 'remote', 'hybrid', 'field']).default('office'),
  dateOfJoining: z.coerce.date(),
  attendanceConfig: z.object({
    shiftId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    isAttendanceEnabled: z.boolean().default(true)
  }).optional(),
});

exports.createEmployeeSchema = employeeBaseSchema;

exports.updateEmployeeSchema = employeeBaseSchema.partial().omit({ user: true }); // Prevent updating user reference

exports.deactivateEmployeeSchema = z.object({
  status: z.enum(['relieved', 'terminated', 'inactive']).default('inactive'),
  dateOfExit: z.coerce.date().default(() => new Date()),
  exitReason: z.string().min(5, 'Please provide a valid exit reason')
});

exports.getEmployee360Schema = z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Employee ID format')
  });