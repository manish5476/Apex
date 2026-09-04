const noteRepo = require('../../domain/repositories/note.repository');
const noteCache = require('../../cache/note.cache');
const {
  publishNoteCreated,
  publishNoteUpdated,
  publishNoteDeleted,
} = require('../../events/note.events');
const ApiError = require('../../../../../core/ApiError');

class NoteService {
  async create(data) {
    const entity = await noteRepo.create(data);
    await noteCache.flushNamespace();
    publishNoteCreated(entity);
    return entity;
  }

  async getById(id) {
    return noteCache.remember(`id:${id}`, 120, async () => {
      const entity = await noteRepo.findById(id);
      if (!entity) throw ApiError.notFound('Note not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return noteCache.remember(cacheKey, 60, () => noteRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await noteRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Note not found');
    await noteCache.forget(`id:${id}`);
    await noteCache.flushNamespace();
    publishNoteUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await noteRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Note not found');
    await noteCache.forget(`id:${id}`);
    await noteCache.flushNamespace();
    publishNoteDeleted(id);
    return entity;
  }
}

module.exports = new NoteService();
