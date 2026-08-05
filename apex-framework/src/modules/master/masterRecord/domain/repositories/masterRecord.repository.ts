import { AnyBulkWriteOperation, FilterQuery, HydratedDocument, Query, UpdateQuery } from 'mongoose';
import { BaseRepository } from '../../../../../core/repository';
import { IMasterRecord, MasterRecord } from '../../infrastructure/models/masterRecord.model';

export interface BulkCreateItem {
  organizationId: unknown;
  type: string;
  name: string;
  slug?: string;
  code: string | null;
  description: string | null;
  createdBy: unknown;
  isActive: boolean;
}

export interface InsertManyWriteError extends Error {
  writeErrors?: Array<{ err: { index: number; errmsg: string } }>;
  insertedDocs?: HydratedDocument<IMasterRecord>[];
}

export class MasterRecordRepository extends BaseRepository<IMasterRecord> {
  constructor() {
    super(MasterRecord);
  }

  /**
   * Returns an unexecuted Mongoose Query so ApiFeatures can chain on top —
   * matches your original `new ApiFeatures(Master.find(filter), req.query)`.
   */
  buildListQuery(filter: FilterQuery<IMasterRecord>): Query<HydratedDocument<IMasterRecord>[], IMasterRecord> {
    return this.model.find(filter);
  }

  async findOneByIdAndOrg(id: string, organizationId: unknown): Promise<HydratedDocument<IMasterRecord> | null> {
    return this.model.findOne({ _id: id, organizationId });
  }

  async save(doc: HydratedDocument<IMasterRecord>): Promise<HydratedDocument<IMasterRecord>> {
    return doc.save();
  }

  async softDeleteByIdAndOrg(
    id: string,
    organizationId: unknown
  ): Promise<HydratedDocument<IMasterRecord> | null> {
    return this.model.findOneAndUpdate(
      { _id: id, organizationId },
      { isActive: false },
      { new: true }
    );
  }

  async bulkInsert(
    items: BulkCreateItem[]
  ): Promise<{ inserted: HydratedDocument<IMasterRecord>[]; error: InsertManyWriteError | null }> {
    try {
      const inserted = (await this.model.insertMany(items, {
        ordered: false,
      })) as unknown as HydratedDocument<IMasterRecord>[];
      return { inserted, error: null };
    } catch (err) {
      return { inserted: [], error: err as InsertManyWriteError };
    }
  }

  async bulkWrite(operations: AnyBulkWriteOperation<IMasterRecord>[]): Promise<{ modifiedCount: number }> {
    const result = await this.model.bulkWrite(operations);
    return { modifiedCount: result.modifiedCount };
  }

  async bulkSoftDelete(ids: string[], organizationId: unknown): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateMany(
      { _id: { $in: ids }, organizationId },
      { $set: { isActive: false } }
    );
    return { modifiedCount: result.modifiedCount };
  }
}