import { z } from 'zod';

export const createMasterRecordSchema = z.object({
  body: z.object({
    type: z.string({ required_error: 'Type and name are required' }).trim().min(1),
    name: z.string({ required_error: 'Type and name are required' }).trim().min(1),
    code: z.string().trim().optional(),
    description: z.string().trim().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const listMasterRecordsSchema = z.object({
  query: z.object({
    type: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    sort: z.string().optional(),
    fields: z.string().optional(),
    keyword: z.string().optional(),
  }),
});

export const updateMasterRecordSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    type: z.string().trim().optional(),
    name: z.string().trim().optional(),
    code: z.string().trim().optional(),
    description: z.string().trim().optional(),
    isActive: z.boolean().optional(),
    parentId: z.string().nullable().optional(),
    imageUrl: z.string().trim().optional(),
    metadata: z
      .object({
        isFeatured: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
      .optional(),
  }),
});

export const masterRecordIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const bulkCreateMasterRecordsSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          type: z.string().trim().min(1),
          name: z.string().trim().min(1),
          slug: z.string().optional(),
          code: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .nonempty({ message: 'Items must be a non-empty array' }),
  }),
});

export const bulkUpdateMasterRecordsSchema = z.object({
  body: z.object({
    items: z
      .array(z.object({ _id: z.string().min(1) }).catchall(z.unknown()))
      .nonempty({ message: 'Items must be a non-empty array' }),
  }),
});

export const bulkDeleteMasterRecordsSchema = z.object({
  body: z.object({
    ids: z.array(z.string().min(1)).nonempty({ message: 'IDs must be a non-empty array' }),
  }),
});

export type CreateMasterRecordInput = z.infer<typeof createMasterRecordSchema>['body'];
export type UpdateMasterRecordInput = z.infer<typeof updateMasterRecordSchema>['body'];
export type BulkCreateMasterRecordsInput = z.infer<typeof bulkCreateMasterRecordsSchema>['body'];
export type BulkUpdateMasterRecordsInput = z.infer<typeof bulkUpdateMasterRecordsSchema>['body'];
export type BulkDeleteMasterRecordsInput = z.infer<typeof bulkDeleteMasterRecordsSchema>['body'];