const transferRequestRepo = require('../../domain/repositories/transferRequest.repository');
const transferRequestCache = require('../../cache/transferRequest.cache');
const {
  publishTransferRequestCreated,
  publishTransferRequestUpdated,
  publishTransferRequestDeleted,
} = require('../../events/transferRequest.events');
const ApiError = require('../../../../../core/ApiError');

class TransferRequestService {
  async create(data) {
    const entity = await transferRequestRepo.create(data);
    await transferRequestCache.flushNamespace();
    publishTransferRequestCreated(entity);
    return entity;
  }

  async getById(id) {
    return transferRequestCache.remember(`id:${id}`, 120, async () => {
      const entity = await transferRequestRepo.findById(id);
      if (!entity) throw ApiError.notFound('TransferRequest not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return transferRequestCache.remember(cacheKey, 60, () => transferRequestRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await transferRequestRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('TransferRequest not found');
    await transferRequestCache.forget(`id:${id}`);
    await transferRequestCache.flushNamespace();
    publishTransferRequestUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await transferRequestRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('TransferRequest not found');
    await transferRequestCache.forget(`id:${id}`);
    await transferRequestCache.flushNamespace();
    publishTransferRequestDeleted(id);
    return entity;
  }
}

module.exports = new TransferRequestService();
