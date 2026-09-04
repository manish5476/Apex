/**
 * Each function returns the file content for one file in a generated module.
 *
 * `names` = {
 *   pascal, camel, kebab, upper   -> derived from the LEAF segment (e.g. "attendance")
 *   corePath2                     -> relative path to src/core from a file 2 levels
 *                                    deep inside the module (controllers, routes,
 *                                    validators, services, repositories, models)
 *   corePath1                     -> relative path to src/core from a file 1 level
 *                                    deep inside the module (events, cache)
 * }
 *
 * corePath1/2 are computed by the generator based on module nesting depth, so this
 * SAME template produces correct imports whether the module is
 *   src/modules/products/...            (depth 1)
 * or
 *   src/modules/hrms/attendance/...     (depth 2, nested under a parent namespace)
 */

const model = ({ pascal, camel, corePath2 }) => `const mongoose = require('mongoose');
const { getConnection } = require('${corePath2}/database');

const ${camel}Schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add ${pascal}-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.${camel.toUpperCase()}_DB_NAME || '${camel}_db');

module.exports = conn.model('${pascal}', ${camel}Schema);
`;

const repository = ({ pascal, camel, corePath2 }) => `const BaseRepository = require('${corePath2}/BaseRepository');
const ${pascal} = require('../../infrastructure/models/${camel}.model');

class ${pascal}Repository extends BaseRepository {
  constructor() {
    super(${pascal});
  }

  // TODO: add ${pascal}-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ${pascal}Repository();
`;

const cache = ({ camel, corePath1 }) => `const CacheService = require('${corePath1}/cache');

module.exports = new CacheService('${camel}');
`;

const events = ({ pascal, camel, upper, corePath1 }) => `const eventBus = require('${corePath1}/eventBus');

const ${upper}_EVENTS = {
  CREATED: '${camel}.created',
  UPDATED: '${camel}.updated',
  DELETED: '${camel}.deleted',
};

function publish${pascal}Created(entity) {
  eventBus.publish(${upper}_EVENTS.CREATED, { id: entity._id });
}

function publish${pascal}Updated(entity) {
  eventBus.publish(${upper}_EVENTS.UPDATED, { id: entity._id });
}

function publish${pascal}Deleted(id) {
  eventBus.publish(${upper}_EVENTS.DELETED, { id });
}

module.exports = {
  ${upper}_EVENTS,
  publish${pascal}Created,
  publish${pascal}Updated,
  publish${pascal}Deleted,
};
`;

const service = ({ pascal, camel, corePath2 }) => `const ${camel}Repo = require('../../domain/repositories/${camel}.repository');
const ${camel}Cache = require('../../cache/${camel}.cache');
const {
  publish${pascal}Created,
  publish${pascal}Updated,
  publish${pascal}Deleted,
} = require('../../events/${camel}.events');
const ApiError = require('${corePath2}/ApiError');

class ${pascal}Service {
  async create(data) {
    const entity = await ${camel}Repo.create(data);
    await ${camel}Cache.flushNamespace();
    publish${pascal}Created(entity);
    return entity;
  }

  async getById(id) {
    return ${camel}Cache.remember(\`id:\${id}\`, 120, async () => {
      const entity = await ${camel}Repo.findById(id);
      if (!entity) throw ApiError.notFound('${pascal} not found');
      return entity;
    });
  }

  async list(filters = {}, options = {}) {
    const cacheKey = \`list:\${JSON.stringify(filters)}:\${JSON.stringify(options)}\`;
    return ${camel}Cache.remember(cacheKey, 60, () => ${camel}Repo.find(filters, options));
  }

  async update(id, updates) {
    const entity = await ${camel}Repo.updateById(id, updates);
    if (!entity) throw ApiError.notFound('${pascal} not found');
    await ${camel}Cache.forget(\`id:\${id}\`);
    await ${camel}Cache.flushNamespace();
    publish${pascal}Updated(entity);
    return entity;
  }

  async remove(id) {
    const entity = await ${camel}Repo.deleteById(id);
    if (!entity) throw ApiError.notFound('${pascal} not found');
    await ${camel}Cache.forget(\`id:\${id}\`);
    await ${camel}Cache.flushNamespace();
    publish${pascal}Deleted(id);
    return entity;
  }
}

module.exports = new ${pascal}Service();
`;

const validator = ({ pascal, corePath2 }) => `const { z } = require('zod');
const ApiError = require('${corePath2}/ApiError');

const createSchema = z.object({
  name: z.string().min(2).max(200),
  // TODO: add ${pascal}-specific fields
});

const updateSchema = createSchema.partial();

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(ApiError.badRequest('Validation failed', result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  validateCreate: validate(createSchema),
  validateUpdate: validate(updateSchema),
};
`;

const controller = ({ camel, corePath2 }) => `const ${camel}Service = require('../../application/services/${camel}.service');
const catchAsync = require('${corePath2}/catchAsync');

exports.create = catchAsync(async (req, res) => {
  const entity = await ${camel}Service.create(req.body);
  res.status(201).json({ success: true, data: entity });
});

exports.getOne = catchAsync(async (req, res) => {
  const entity = await ${camel}Service.getById(req.params.id);
  res.json({ success: true, data: entity });
});

exports.list = catchAsync(async (req, res) => {
  const { page, limit, sort } = req.query;
  const result = await ${camel}Service.list({}, { page, limit, sort });
  res.json({ success: true, ...result });
});

exports.update = catchAsync(async (req, res) => {
  const entity = await ${camel}Service.update(req.params.id, req.body);
  res.json({ success: true, data: entity });
});

exports.remove = catchAsync(async (req, res) => {
  await ${camel}Service.remove(req.params.id);
  res.status(204).send();
});
`;

const routes = ({ camel }) => `const express = require('express');
const router = express.Router();

const controller = require('../controllers/${camel}.controller');
const { validateCreate, validateUpdate } = require('../validators/${camel}.validator');

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', validateCreate, controller.create);
router.patch('/:id', validateUpdate, controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
`;

const moduleIndex = ({ camel, upper }) => `const router = require('./api/routes/${camel}.routes');
const ${camel}Service = require('./application/services/${camel}.service');
const { ${upper}_EVENTS } = require('./events/${camel}.events');

module.exports = {
  router,
  service: ${camel}Service,
  events: ${upper}_EVENTS,
};
`;

/**
 * Aggregator index.js for a PARENT namespace (e.g. src/modules/hrms/index.js).
 * Mounts each sub-module's router under its own path segment.
 * `children` = array of camelCase sub-module names already generated under this parent.
 */
const parentAggregatorIndex = (children) => {
  const toKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

  const requires = children
    .map((c) => `router.use('/${toKebab(c)}', require('./${c}').router);`)
    .join('\n');

  return `const express = require('express');
const router = express.Router();

/**
 * This is a NAMESPACE, not a module with its own model/service.
 * It only aggregates its sub-modules' routers below. Each one is a
 * fully independent module with its own model, repository, service,
 * events and cache — they do NOT import each other directly, only
 * communicate via the event bus.
 */
${requires}

module.exports = { router };
`;
};

module.exports = {
  model,
  repository,
  cache,
  events,
  service,
  validator,
  controller,
  routes,
  moduleIndex,
  parentAggregatorIndex,
};
