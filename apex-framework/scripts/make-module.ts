#!/usr/bin/env node
/**
 * Module generator.
 *
 * Flat module:
 *   node scripts/make-module.js products
 *   -> src/modules/products/  (mount in gateway as /products)
 *
 * Nested sub-module under a parent namespace (e.g. HRMS):
 *   node scripts/make-module.js hrms/attendance
 *   node scripts/make-module.js hrms/employee
 *   node scripts/make-module.js hrms/leave
 *   -> src/modules/hrms/attendance/  (full independent module)
 *   -> src/modules/hrms/employee/    (full independent module)
 *   -> src/modules/hrms/index.js     (auto-created/updated aggregator,
 *                                      mounts each sub-module's router)
 *
 * Then mount ONLY the top-level namespace in gateway:
 *   router.use('/hrms', require('../modules/hrms').router);
 * -> exposes /hrms/attendance/*, /hrms/employee/*, /hrms/leave/*, etc.
 *
 * Nesting can go deeper too (hrms/payroll/salary) — each level gets its
 * own aggregator index.js automatically.
 */
const fs = require('fs');
const path = require('path');
const templates = require('./templates/moduleTemplates');

const rawArg = process.argv[2];

if (!rawArg) {
  console.error('Usage: node scripts/make-module.js <moduleName>');
  console.error('Examples:');
  console.error('  node scripts/make-module.js products');
  console.error('  node scripts/make-module.js hrms/attendance');
  process.exit(1);
}

function toPascalCase(str) {
  return str
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function toCamelCase(str) {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// Split "hrms/attendance" -> ['hrms', 'attendance'], normalize each segment
const segments = rawArg
  .split('/')
  .filter(Boolean)
  .map((seg) => toCamelCase(seg));

if (segments.length === 0) {
  console.error('Invalid module name.');
  process.exit(1);
}

const leaf = segments[segments.length - 1];
const parentSegments = segments.slice(0, -1); // [] for flat modules

const pascal = toPascalCase(leaf);
const camel = leaf;
const kebab = camel.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const upper = camel.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

// --- compute core-relative import paths based on nesting depth ---
// distance (in directories) from a file to src/core:
//   1 (the "modules" dir) + segments.length (module path depth) + subfolderDepth
const moduleDepth = segments.length;
const upPath = (subfolderDepth) => '../'.repeat(1 + moduleDepth + subfolderDepth) + 'core';

const names = {
  pascal,
  camel,
  kebab,
  upper,
  corePath2: upPath(2), // controllers/routes/validators/services/repositories/models
  corePath1: upPath(1), // events/cache
};

const modulesRoot = path.join(__dirname, '..', 'src', 'modules');
const moduleRoot = path.join(modulesRoot, ...segments);

if (fs.existsSync(moduleRoot)) {
  console.error(`Module "${segments.join('/')}" already exists at ${moduleRoot}`);
  process.exit(1);
}

const structure = [
  ['api/controllers', `${camel}.controller.js`, templates.controller],
  ['api/routes', `${camel}.routes.js`, templates.routes],
  ['api/validators', `${camel}.validator.js`, templates.validator],
  ['application/services', `${camel}.service.js`, templates.service],
  ['domain/repositories', `${camel}.repository.js`, templates.repository],
  ['infrastructure/models', `${camel}.model.js`, templates.model],
  ['events', `${camel}.events.js`, templates.events],
  ['cache', `${camel}.cache.js`, templates.cache],
  ['', 'index.js', templates.moduleIndex],
];

const emptyFolders = ['jobs', 'tests'];

structure.forEach(([dir, filename, templateFn]) => {
  const fullDir = path.join(moduleRoot, dir);
  fs.mkdirSync(fullDir, { recursive: true });
  fs.writeFileSync(path.join(fullDir, filename), templateFn(names));
});

emptyFolders.forEach((dir) => {
  const fullDir = path.join(moduleRoot, dir);
  fs.mkdirSync(fullDir, { recursive: true });
  fs.writeFileSync(path.join(fullDir, '.gitkeep'), '');
});

console.log(`✔ Module "${segments.join('/')}" created at src/modules/${segments.join('/')}`);

// --- maintain parent aggregator index.js files, bottom-up ---
// e.g. for hrms/attendance -> ensure src/modules/hrms/index.js exists and
// includes an entry for "attendance".
//
// Children are determined by SCANNING THE FILESYSTEM (any subdirectory that
// itself has an index.js is a child module), not by parsing the previous
// index.js's text. This is deliberate: regex-parsing generated code to infer
// state is fragile (a kebab-case URL segment like "/attendance-daily" breaks
// a naive \w+ pattern) and silently drops entries. Scanning disk state is
// the single source of truth and self-heals even if a previous run left an
// aggregator in a bad state.
function scanChildren(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(dirPath, name, 'index.js')))
    .sort();
}

function ensureParentAggregator(parentSegs) {
  if (parentSegs.length === 0) return; // no parent namespace, nothing to aggregate

  const parentDir = path.join(modulesRoot, ...parentSegs);
  const parentIndexPath = path.join(parentDir, 'index.js');
  fs.mkdirSync(parentDir, { recursive: true });

  const children = scanChildren(parentDir);

  fs.writeFileSync(parentIndexPath, templates.parentAggregatorIndex(children));
  console.log(`  ↳ updated aggregator: src/modules/${parentSegs.join('/')}/index.js (${children.length} children)`);

  // Recurse in case of deeper nesting (e.g. a/b/c -> also ensure a/index.js aggregates b)
  if (parentSegs.length > 1) {
    ensureParentAggregator(parentSegs.slice(0, -1));
  }
}

ensureParentAggregator(parentSegments);

console.log('');
if (parentSegments.length > 0) {
  const topLevel = parentSegments[0];
  console.log('Next step — mount the top-level namespace ONCE in src/gateway/routes.js:');
  console.log(`  router.use('/${topLevel}', require('../modules/${topLevel}').router);`);
  console.log(`(sub-modules are auto-exposed under /${topLevel}/${kebab}, etc. — no extra gateway line needed per sub-module)`);
} else {
  console.log('Next step — mount it in src/gateway/routes.js:');
  console.log(`  router.use('/${kebab}', require('../modules/${camel}').router);`);
}
