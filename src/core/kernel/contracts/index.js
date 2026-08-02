'use strict';

/**
 * Base Repository Interface.
 * Enforces a strict contract for all data persistence operations,
 * decoupling the domain layer from the underlying database (e.g. Mongoose).
 */
class IRepository {
  async findById(id) { throw new Error('NotImplementedException'); }
  async findOne(spec) { throw new Error('NotImplementedException'); }
  async find(spec) { throw new Error('NotImplementedException'); }
  async save(entity) { throw new Error('NotImplementedException'); }
  async delete(id) { throw new Error('NotImplementedException'); }
  async exists(spec) { throw new Error('NotImplementedException'); }
}

/**
 * Unit of Work Interface.
 * Manages transactional boundaries across multiple repositories.
 */
class IUnitOfWork {
  async startTransaction() { throw new Error('NotImplementedException'); }
  async commitTransaction() { throw new Error('NotImplementedException'); }
  async rollbackTransaction() { throw new Error('NotImplementedException'); }
  async withTransaction(work) { throw new Error('NotImplementedException'); }
}

/**
 * Event Bus Interface.
 * Handles publishing and subscribing to Domain Events.
 */
class IEventBus {
  async publish(event) { throw new Error('NotImplementedException'); }
  subscribe(eventName, handler) { throw new Error('NotImplementedException'); }
}

/**
 * Logger Interface.
 * Enforces structured logging across all environments.
 */
class ILogger {
  info(message, meta) { throw new Error('NotImplementedException'); }
  warn(message, meta) { throw new Error('NotImplementedException'); }
  error(message, meta, error) { throw new Error('NotImplementedException'); }
  debug(message, meta) { throw new Error('NotImplementedException'); }
}

/**
 * Cache Interface.
 */
class ICache {
  async get(key) { throw new Error('NotImplementedException'); }
  async set(key, value, ttlSeconds) { throw new Error('NotImplementedException'); }
  async invalidate(key) { throw new Error('NotImplementedException'); }
}

module.exports = {
  IRepository,
  IUnitOfWork,
  IEventBus,
  ILogger,
  ICache
};
