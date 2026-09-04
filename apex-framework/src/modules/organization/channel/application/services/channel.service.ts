const channelRepo = require('../../domain/repositories/channel.repository');
const channelCache = require('../../cache/channel.cache');
const {
  publishChannelCreated,
  publishChannelUpdated,
  publishChannelDeleted,
} = require('../../events/channel.events');
const ApiError = require('../../../../../core/ApiError');

class ChannelService {
  async create(data) {
    const entity = await channelRepo.create(data);
    await channelCache.flushNamespace();
    publishChannelCreated(entity);
    return entity;
  }

  async getById(id) {
    return channelCache.remember(`id:${id}`, 120, async () => {
      const entity = await channelRepo.findById(id);
      if (!entity) throw ApiError.notFound('Channel not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return channelCache.remember(cacheKey, 60, () => channelRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await channelRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Channel not found');
    await channelCache.forget(`id:${id}`);
    await channelCache.flushNamespace();
    publishChannelUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await channelRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Channel not found');
    await channelCache.forget(`id:${id}`);
    await channelCache.flushNamespace();
    publishChannelDeleted(id);
    return entity;
  }
}

module.exports = new ChannelService();
