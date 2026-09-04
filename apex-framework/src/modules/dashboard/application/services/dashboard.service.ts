const dashboardRepo = require('../../domain/repositories/dashboard.repository');
const dashboardCache = require('../../cache/dashboard.cache');
const {
  publishDashboardCreated,
  publishDashboardUpdated,
  publishDashboardDeleted,
} = require('../../events/dashboard.events');
const ApiError = require('../../../../core/ApiError');

class DashboardService {
  async create(data) {
    const entity = await dashboardRepo.create(data);
    await dashboardCache.flushNamespace();
    publishDashboardCreated(entity);
    return entity;
  }

  async getById(id) {
    return dashboardCache.remember(`id:${id}`, 120, async () => {
      const entity = await dashboardRepo.findById(id);
      if (!entity) throw ApiError.notFound('Dashboard not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = `list:${JSON.stringify(filters)}:${JSON.stringify(options)}`;
    return dashboardCache.remember(cacheKey, 60, () => dashboardRepo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await dashboardRepo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('Dashboard not found');
    await dashboardCache.forget(`id:${id}`);
    await dashboardCache.flushNamespace();
    publishDashboardUpdated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await dashboardRepo.deleteById(id);
    if (!entity) throw ApiError.notFound('Dashboard not found');
    await dashboardCache.forget(`id:${id}`);
    await dashboardCache.flushNamespace();
    publishDashboardDeleted(id);
    return entity;
  }
}

module.exports = new DashboardService();
