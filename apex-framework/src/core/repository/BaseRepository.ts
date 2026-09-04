import { Document, FilterQuery, HydratedDocument, Model, Types, UpdateQuery, AnyKeys } from 'mongoose';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string | Record<string, 1 | -1>;
}

export interface PaginatedResult<T> {
  data: HydratedDocument<T>[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Base repository every module repository can extend.
 * This is where "queries/commands" live in a lightweight form —
 * without splitting into a dozen tiny files. Add module-specific
 * methods in the subclass (e.g. findBySku, findLowStock).
 */
export class BaseRepository<T extends Document> {
  protected readonly model: Model<T>;

  constructor(model: Model<T>) {
    this.model = model;
  }

  async create(data: AnyKeys<T>): Promise<HydratedDocument<T>> {
    return this.model.create(data);
  }

  async findById(id: string | Types.ObjectId): Promise<HydratedDocument<T> | null> {
    return this.model.findById(id);
  }

  async findOne(filter: FilterQuery<T>): Promise<HydratedDocument<T> | null> {
    return this.model.findOne(filter);
  }

  async find(
    filter: FilterQuery<T> = {},
    { page = 1, limit = 20, sort = '-createdAt' }: PaginationOptions = {}
  ): Promise<PaginatedResult<T>> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model.find(filter).sort(sort).skip(skip).limit(limit),
      this.model.countDocuments(filter),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async updateById(
    id: string | Types.ObjectId,
    updates: UpdateQuery<T>
  ): Promise<HydratedDocument<T> | null> {
    return this.model.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  }

  async deleteById(id: string | Types.ObjectId): Promise<HydratedDocument<T> | null> {
    return this.model.findByIdAndDelete(id);
  }

  async exists(filter: FilterQuery<T>): Promise<{ _id: Types.ObjectId } | null> {
    return this.model.exists(filter);
  }
}