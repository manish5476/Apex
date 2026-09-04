import { HydratedDocument, UpdateQuery } from 'mongoose';
import { ApiError } from '../../../../../core/errors';
import { ApiFeatures, ApiFeaturesQueryParams } from '../../../../../core/utils/ApiFeatures';
import { IMasterRecord } from '../../infrastructure/models/masterRecord.model';
import { MasterRecordRepository, BulkCreateItem } from '../../domain/repositories/masterRecord.repository';
import { MasterRecordCache } from '../../cache/masterRecord.cache';
import {
  publishMasterRecordCreated,
  publishMasterRecordUpdated,
  publishMasterRecordDeleted,
} from '../../events/masterRecord.events';
import { AuthenticatedUser } from '../../../../../core/http/types';

export interface CreateMasterRecordDto {
  type: string;
  name: string;
  code?: string;
  description?: string;
  isActive?: boolean;
}

export type UpdateMasterRecordDto = Partial
  Pick<IMasterRecord, 'type' | 'name' | 'code' | 'description' | 'isActive' | 'parentId' | 'metadata' | 'imageUrl'>
>;

const UPDATE_ALLOWED_FIELDS: Array<keyof UpdateMasterRecordDto> = [
  'type',
  'name',
  'code',
  'description',
  'isActive',
  'parentId',
  'metadata',
  'imageUrl',
];

export interface BulkCreateInputItem {
  type: string;
  name: string;
  slug?: string;
  code?: string;
  description?: string;
}

export interface BulkUpdateInputItem {
  _id: string;
  [key: string]: unknown;
}

export type BulkCreateResult =
  | { status: 'success'; insertedCount: number; masters: HydratedDocument<IMasterRecord>[] }
  | {
      status: 'partial_success';
      insertedCount: number;
      failedCount: number;
      failedItems: Array<{ index: number; error: string }>;
      masters: HydratedDocument<IMasterRecord>[];
    };

export class MasterRecordService {
  constructor(
    private readonly repository: MasterRecordRepository = new MasterRecordRepository(),
    private readonly cache: MasterRecordCache = new MasterRecordCache()
  ) {}

  async create(dto: CreateMasterRecordDto, user: AuthenticatedUser): Promise<HydratedDocument<IMasterRecord>> {
    const created = await this.repository.create({
      organizationId: user.organizationId,
      type: dto.type.toLowerCase(),
      name: dto.name.trim(),
      code: dto.code,
      description: dto.description,
      isActive: dto.isActive ?? true,
      createdBy: user._id,
    });

    await this.cache.invalidateOrg(user.organizationId);
    publishMasterRecordCreated(created);
    return created;
  }

  async list(
    organizationId: unknown,
    type: string | undefined,
    queryParams: ApiFeaturesQueryParams
  ): Promise<{ results: number; pagination: unknown; data: HydratedDocument<IMasterRecord>[] }> {
    const filter: Record<string, unknown> = { organizationId };
    if (type) filter.type = type.toLowerCase();

    // Only cache unfiltered/unpaginated "give me everything for this org+type"
    // reads — anything with page/sort/search params bypasses cache since
    // ApiFeatures mutates the query in ways not worth key-encoding here.
    const hasQueryModifiers = Object.keys(queryParams).some((k) =>
      ['page', 'limit', 'sort', 'fields', 'keyword'].includes(k)
    );

    const compute = async () => {
      const features = new ApiFeatures(this.repository.buildListQuery(filter), queryParams)
        .filter()
        .search(['name', 'code', 'description'])
        .sort()
        .limitFields()
        .paginate();
      return features.execute();
    };

    const result = hasQueryModifiers
      ? await compute()
      : await this.cache.rememberList(organizationId, type, 60, compute);

    return { results: result.results, pagination: result.pagination, data: result.data };
  }

  async update(
    id: string,
    organizationId: unknown,
    updates: UpdateMasterRecordDto
  ): Promise<HydratedDocument<IMasterRecord>> {
    const master = await this.repository.findOneByIdAndOrg(id, organizationId);
    if (!master) throw ApiError.notFound('Master not found or not yours');

    UPDATE_ALLOWED_FIELDS.forEach((field) => {
      const value = updates[field];
      if (value === undefined) return;
      if (field === 'type' && typeof value === 'string') {
        master.type = value.toLowerCase();
      } else if (field === 'name' && typeof value === 'string') {
        master.name = value.trim();
      } else {
        (master as unknown as Record<string, unknown>)[field] = value;
      }
    });

    try {
      const saved = await this.repository.save(master);
      await this.cache.invalidateOrg(organizationId);
      publishMasterRecordUpdated(saved);
      return saved;
    } catch (error) {
      const mongoErr = error as { code?: number };
      if (mongoErr.code === 11000) {
        throw ApiError.conflict('Duplicate value: A record with this Name or Code already exists.');
      }
      throw error;
    }
  }

  async softDelete(id: string, organizationId: unknown): Promise<void> {
    const master = await this.repository.softDeleteByIdAndOrg(id, organizationId);
    if (!master) throw ApiError.notFound('Master not found');
    await this.cache.invalidateOrg(organizationId);
    publishMasterRecordDeleted(id, organizationId, master.type);
  }

  async bulkCreate(items: BulkCreateInputItem[], user: AuthenticatedUser): Promise<BulkCreateResult> {
    const formattedItems: BulkCreateItem[] = items.map((item, index) => {
      if (!item.type || !item.name) {
        throw ApiError.badRequest(`Missing required fields at index ${index}`);
      }
      return {
        organizationId: user.organizationId,
        type: item.type.toLowerCase(),
        name: item.name.trim(),
        slug: item.slug,
        code: item.code ?? null,
        description: item.description ?? null,
        createdBy: user._id,
        isActive: true,
      };
    });

    const { inserted, error } = await this.repository.bulkInsert(formattedItems);
    await this.cache.invalidateOrg(user.organizationId);

    if (error?.writeErrors) {
      const successful = error.insertedDocs ?? [];
      return {
        status: 'partial_success',
        insertedCount: successful.length,
        failedCount: error.writeErrors.length,
        failedItems: error.writeErrors.map((e) => ({ index: e.err.index, error: e.err.errmsg })),
        masters: successful,
      };
    }

    if (error) throw error;

    return { status: 'success', insertedCount: inserted.length, masters: inserted };
  }

  async bulkUpdate(items: BulkUpdateInputItem[], organizationId: unknown): Promise<{ modifiedCount: number }> {
    const operations = items
      .map((item) => {
        const { _id, ...updates } = item;
        if (!_id) return null;
        return {
          updateOne: {
            filter: { _id, organizationId },
            update: { $set: updates as UpdateQuery<IMasterRecord> },
          },
        };
      })
      .filter((op): op is NonNullable<typeof op> => op !== null);

    if (operations.length === 0) {
      throw ApiError.badRequest('No valid items with _id provided');
    }

    const result = await this.repository.bulkWrite(operations);
    await this.cache.invalidateOrg(organizationId);
    return result;
  }

  async bulkDelete(ids: string[], organizationId: unknown): Promise<{ modifiedCount: number }> {
    const result = await this.repository.bulkSoftDelete(ids, organizationId);
    await this.cache.invalidateOrg(organizationId);
    return result;
  }
}