const sectionTemplateRepo = require('../../domain/repositories/sectionTemplate.repository');
const sectionTemplateCache = require('../../cache/sectionTemplate.cache');
const {
  publishSectionTemplateCreated,
  publishSectionTemplateUpdated,
  publishSectionTemplateDeleted,
} = require('../../events/sectionTemplate.events');
const ApiError = require('../../../../../core/ApiError');

class SectionTemplateService {
  async create(data) {
    const entity = await sectionTemplateRepo.create(data);
    await sectionTemplateCache.flushNamespace();
    publishSectionTemplateCreated(entity);
    return entity;
  }

  async getById(id) {
    return sectionTemplateCache.remember(`id:${id}`, 120, async () => {
      const entity = await sectionTemplateRepo.findById(id);
      if (!entity) throw ApiError.notFound('SectionTemplate not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return sectionTemplateCache.remember(cacheKey, 60, () => sectionTemplateRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await sectionTemplateRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('SectionTemplate not found');
    await sectionTemplateCache.forget(`id:${id}`);
    await sectionTemplateCache.flushNamespace();
    publishSectionTemplateUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await sectionTemplateRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('SectionTemplate not found');
    await sectionTemplateCache.forget(`id:${id}`);
    await sectionTemplateCache.flushNamespace();
    publishSectionTemplateDeleted(id);
    return entity;
  }
}

module.exports = new SectionTemplateService();
