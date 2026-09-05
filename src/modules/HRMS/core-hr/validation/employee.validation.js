const { z } = require('zod');

// Base schema for shared employee fields
const employeeBaseSchema = z.object({
  user: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid User ID').nullable().optional(),
  branchId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Branch ID').nullable().optional(),
  departmentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Department ID').nullable().optional(),
  designationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Designation ID').nullable().optional(),
  reportingManagerId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Manager ID').nullable().optional(),
  
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  officialEmail: z.string().email('Invalid email address').trim().toLowerCase().optional(),
  phone: z.string().trim().max(20).optional(),

  employeeId: z.string().min(2).max(50).trim().toUpperCase(),
  employmentType: z.enum(['permanent', 'contract', 'intern', 'probation', 'consultant']).default('permanent'),
  workMode: z.enum(['office', 'remote', 'hybrid', 'field']).default('office'),
  status: z.enum(['active', 'probation', 'notice_period', 'relieved', 'terminated', 'inactive']).default('active').optional(),
  dateOfJoining: z.coerce.date(),
  probationEndDate: z.coerce.date().optional(),
  confirmationDate: z.coerce.date().optional(),
  
  personal: z.object({
    dateOfBirth: z.coerce.date().optional(),
    gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
    maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']).optional(),
    bloodGroup: z.string().optional(),
    secondaryPhone: z.string().optional(),
  }).optional(),

  emergencyContacts: z.array(z.object({
    name: z.string().min(1, 'Name is required'),
    relationship: z.string().optional(),
    phone: z.string().min(1, 'Phone is required'),
    alternatePhone: z.string().optional(),
  })).optional(),

  attendanceConfig: z.object({
    shiftId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
    shiftGroupId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
    machineUserId: z.string().optional(),
    isAttendanceEnabled: z.boolean().default(true),
    allowWebPunch: z.boolean().default(false),
    allowMobilePunch: z.boolean().default(true),
    enforceGeoFence: z.boolean().default(false),
    geoFenceId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
    geoFenceRadius: z.number().min(0).default(100),
    biometricVerified: z.boolean().default(false),
  }).optional(),

  compensation: z.object({
    salaryStructureId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
    payCycle: z.enum(['monthly', 'weekly', 'daily']).default('monthly'),
    ctcAnnual: z.number().min(0).optional(),
    currency: z.string().default('INR'),
    bankDetails: z.object({
      accountName: z.string().optional(),
      accountNumber: z.string().optional(),
      ifscCode: z.string().optional(),
      bankName: z.string().optional(),
      panCard: z.string().optional(),
      uanNumber: z.string().optional(),
      esiNumber: z.string().optional(),
      pfNumber: z.string().optional(),
    }).optional(),
  }).optional(),
});

exports.createEmployeeSchema = employeeBaseSchema;

exports.updateEmployeeSchema = employeeBaseSchema.partial().omit({ user: true }); // Prevent accidental overwrite of user reference in standard update

exports.deactivateEmployeeSchema = z.object({
  status: z.enum(['relieved', 'terminated', 'inactive']).default('inactive'),
  dateOfExit: z.coerce.date().default(() => new Date()),
  exitReason: z.string().min(5, 'Please provide a valid exit reason'),
  disableLoginAccess: z.boolean().default(true),
});

exports.getEmployee360Schema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Employee ID format')
});

exports.inviteUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email address required'),
  phone: z.string().min(5, 'Phone number required'),
  roleId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Role ID').optional(),
});

exports.linkUserSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid User ID format'),
});