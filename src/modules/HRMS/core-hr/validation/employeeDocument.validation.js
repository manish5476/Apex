const { z } = require('zod');
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const docTypes = ['aadhaar', 'pan', 'passport', 'driving_license', 'offer_letter', 'appointment_letter', 'nda', 'contract', 'education', 'experience', 'relieving_letter', 'policy_acknowledgement', 'other'];

exports.uploadDocumentSchema = z.object({
  user: z.string().regex(objectIdRegex),
  employeeRef: z.string().regex(objectIdRegex).optional(),
  documentType: z.enum(docTypes),
  documentNumber: z.string().trim().optional(), // Handled securely via select: false in schema
  title: z.string().min(2).trim(),
  confidentiality: z.enum(['public', 'internal', 'confidential', 'restricted']).default('confidential'),
  assetId: z.string().regex(objectIdRegex).optional(), // Made optional to fix schema bug
});

exports.verifyDocumentSchema = z.object({
  status: z.enum(['verified', 'rejected']),
  rejectionReason: z.string().optional().refine((val) => {
    // If rejected, a reason must be provided
    return val !== undefined && val.trim().length > 0;
  }, { message: "Rejection reason is required when status is 'rejected'" }),
  expiresAt: z.coerce.date().optional()
});