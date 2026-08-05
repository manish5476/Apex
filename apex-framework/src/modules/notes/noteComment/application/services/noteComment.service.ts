const noteCommentRepo = require('../../domain/repositories/noteComment.repository');
const noteCommentCache = require('../../cache/noteComment.cache');
const {
  publishNoteCommentCreated,
  publishNoteCommentUpdated,
  publishNoteCommentDeleted,
} = require('../../events/noteComment.events');
const ApiError = require('../../../../../core/ApiError');

class NoteCommentService {
  async create(data) {
    const entity = await noteCommentRepo.create(data);
    await noteCommentCache.flushNamespace();
    publishNoteCommentCreated(entity);
    return entity;
  }

  async getById(id) {
    return noteCommentCache.remember(`id:${id}`, 120, async () => {
      const entity = await noteCommentRepo.findById(id);
      if (!entity) throw ApiError.notFound('NoteComment not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return noteCommentCache.remember(cacheKey, 60, () => noteCommentRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await noteCommentRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('NoteComment not found');
    await noteCommentCache.forget(`id:${id}`);
    await noteCommentCache.flushNamespace();
    publishNoteCommentUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await noteCommentRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('NoteComment not found');
    await noteCommentCache.forget(`id:${id}`);
    await noteCommentCache.flushNamespace();
    publishNoteCommentDeleted(id);
    return entity;
  }
}

module.exports = new NoteCommentService();
