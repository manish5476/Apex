const masterRecordRepo = require('../../domain/repositories/masterRecord.repository');
const masterRecordCache = require('../../cache/masterRecord.cache');
const {
  publishMasterRecordCreated,
  publishMasterRecordUpdated,
  publishMasterRecordDeleted,
} = require('../../events/masterRecord.events');
const ApiError = require('../../../../../core/ApiError');

class MasterRecordService {
  async create(data) {
    const entity = await masterRecordRepo.create(data);
    await masterRecordCache.flushNamespace();
    publishMasterRecordCreated(entity);
    return entity;
  }

  async getById(id) {
    return masterRecordCache.remember(`id:${id}`, 120, async () => {
      const entity = await masterRecordRepo.findById(id);
      if (!entity) throw ApiError.notFound('MasterRecord not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return masterRecordCache.remember(cacheKey, 60, () => masterRecordRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await masterRecordRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('MasterRecord not found');
    await masterRecordCache.forget(`id:${id}`);
    await masterRecordCache.flushNamespace();
    publishMasterRecordUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await masterRecordRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('MasterRecord not found');
    await masterRecordCache.forget(`id:${id}`);
    await masterRecordCache.flushNamespace();
    publishMasterRecordDeleted(id);
    return entity;
  }
}

module.exports = new MasterRecordService();
