const noteActivityRepo = require('../../domain/repositories/noteActivity.repository');
const noteActivityCache = require('../../cache/noteActivity.cache');
const {
  publishNoteActivityCreated,
  publishNoteActivityUpdated,
  publishNoteActivityDeleted,
} = require('../../events/noteActivity.events');
const ApiError = require('../../../../../core/ApiError');

class NoteActivityService {
  async create(data) {
    const entity = await noteActivityRepo.create(data);
    await noteActivityCache.flushNamespace();
    publishNoteActivityCreated(entity);
    return entity;
  }

  async getById(id) {
    return noteActivityCache.remember(`id:${id}`, 120, async () => {
      const entity = await noteActivityRepo.findById(id);
      if (!entity) throw ApiError.notFound('NoteActivity not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return noteActivityCache.remember(cacheKey, 60, () => noteActivityRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await noteActivityRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('NoteActivity not found');
    await noteActivityCache.forget(`id:${id}`);
    await noteActivityCache.flushNamespace();
    publishNoteActivityUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await noteActivityRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('NoteActivity not found');
    await noteActivityCache.forget(`id:${id}`);
    await noteActivityCache.flushNamespace();
    publishNoteActivityDeleted(id);
    return entity;
  }
}

module.exports = new NoteActivityService();
