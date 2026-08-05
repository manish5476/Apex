import { HydratedDocument, UpdateQuery } from 'mongoose';
import { BaseRepository } from '../../../../../core/repository';
import { IMasterType, MasterType } from '../../infrastructure/models/masterType.model';

export class MasterTypeRepository extends BaseRepository<IMasterType> {
  constructor() {
    super(MasterType);
  }

  async findActive(): Promise<HydratedDocument<IMasterType>[]> {
    return this.model.find({ isActive: true }).sort('name');
  }

  async updateAndReturn(
    id: string,
    updates: UpdateQuery<IMasterType>
  ): Promise<HydratedDocument<IMasterType> | null> {
    return this.model.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  }

  async softDelete(id: string): Promise<HydratedDocument<IMasterType> | null> {
    return this.model.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }
}