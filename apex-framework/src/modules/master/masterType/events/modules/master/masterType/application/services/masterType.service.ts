import { HydratedDocument } from 'mongoose';
import { ApiError } from '../../../../../core/errors';
import { IMasterType } from '../../infrastructure/models/masterType.model';
import { MasterTypeRepository } from '../../domain/repositories/masterType.repository';
import { MasterTypeCache } from '../../cache/masterType.cache';
import {
  publishMasterTypeCreated,
  publishMasterTypeUpdated,
  publishMasterTypeDeleted,
} from '../../events/masterType.events';

export interface CreateMasterTypeDto {
  name: string;
  label: string;
}

export type UpdateMasterTypeDto = Partial<Pick<IMasterType, 'name' | 'label' | 'isActive'>>;

export class MasterTypeService {
  constructor(
    private readonly repository: MasterTypeRepository = new MasterTypeRepository(),
    private readonly cache: MasterTypeCache = new MasterTypeCache()
  ) {}

  async create(dto: CreateMasterTypeDto): Promise<HydratedDocument<IMasterType>> {
    const created = await this.repository.create({
      name: dto.name.toLowerCase().trim(),
      label: dto.label.trim(),
    });
    await this.cache.invalidate();
    publishMasterTypeCreated(created);
    return created;
  }

  async list(): Promise<HydratedDocument<IMasterType>[]> {
    return this.cache.rememberActiveList(300, () => this.repository.findActive());
  }

  async update(id: string, dto: UpdateMasterTypeDto): Promise<HydratedDocument<IMasterType>> {
    const updated = await this.repository.updateAndReturn(id, dto);
    if (!updated) throw ApiError.notFound('Master type not found');
    await this.cache.invalidate();
    publishMasterTypeUpdated(updated);
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const deleted = await this.repository.softDelete(id);
    if (!deleted) throw ApiError.notFound('Master type not found');
    await this.cache.invalidate();
    publishMasterTypeDeleted(id, deleted.name);
  }
}