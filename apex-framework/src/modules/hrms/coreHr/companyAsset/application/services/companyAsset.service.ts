const companyAssetRepo = require('../../domain/repositories/companyAsset.repository');
const companyAssetCache = require('../../cache/companyAsset.cache');
const {
  publishCompanyAssetCreated,
  publishCompanyAssetUpdated,
  publishCompanyAssetDeleted,
} = require('../../events/companyAsset.events');
const ApiError = require('../../../../../../core/ApiError');

class CompanyAssetService {
  async create(data) {
    const entity = await companyAssetRepo.create(data);
    await companyAssetCache.flushNamespace();
    publishCompanyAssetCreated(entity);
    return entity;
  }

  async getById(id) {
    return companyAssetCache.remember(`id:${id}`, 120, async () => {
      const entity = await companyAssetRepo.findById(id);
      if (!entity) throw ApiError.notFound('CompanyAsset not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return companyAssetCache.remember(cacheKey, 60, () => companyAssetRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await companyAssetRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('CompanyAsset not found');
    await companyAssetCache.forget(`id:${id}`);
    await companyAssetCache.flushNamespace();
    publishCompanyAssetUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await companyAssetRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('CompanyAsset not found');
    await companyAssetCache.forget(`id:${id}`);
    await companyAssetCache.flushNamespace();
    publishCompanyAssetDeleted(id);
    return entity;
  }
}

module.exports = new CompanyAssetService();
