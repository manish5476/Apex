import { z } from 'zod';

export const createMasterTypeSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Name and label are required' }).trim().min(1),
    label: z.string({ required_error: 'Name and label are required' }).trim().min(1),
  }),
});

export const updateMasterTypeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const masterTypeIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export type CreateMasterTypeInput = z.infer<typeof createMasterTypeSchema>['body'];
export type UpdateMasterTypeInput = z.infer<typeof updateMasterTypeSchema>['body'];