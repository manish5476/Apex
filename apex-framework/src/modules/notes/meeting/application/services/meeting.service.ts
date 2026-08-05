const meetingRepo = require('../../domain/repositories/meeting.repository');
const meetingCache = require('../../cache/meeting.cache');
const {
  publishMeetingCreated,
  publishMeetingUpdated,
  publishMeetingDeleted,
} = require('../../events/meeting.events');
const ApiError = require('../../../../../core/ApiError');

class MeetingService {
  async create(data) {
    const entity = await meetingRepo.create(data);
    await meetingCache.flushNamespace();
    publishMeetingCreated(entity);
    return entity;
  }

  async getById(id) {
    return meetingCache.remember(`id:${id}`, 120, async () => {
      const entity = await meetingRepo.findById(id);
      if (!entity) throw ApiError.notFound('Meeting not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return meetingCache.remember(cacheKey, 60, () => meetingRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await meetingRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Meeting not found');
    await meetingCache.forget(`id:${id}`);
    await meetingCache.flushNamespace();
    publishMeetingUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await meetingRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Meeting not found');
    await meetingCache.forget(`id:${id}`);
    await meetingCache.flushNamespace();
    publishMeetingDeleted(id);
    return entity;
  }
}

module.exports = new MeetingService();
