#!/usr/bin/env node
/**
 * One-time repair: rebuild every namespace aggregator index.js in
 * src/modules from actual filesystem state, bottom-up. Fixes any
 * aggregator that was corrupted by the old regex-based children detection.
 */
const fs = require('fs');
const path = require('path');
const templates = require('./templates/moduleTemplates');

const modulesRoot = path.join(__dirname, '..', 'src', 'modules');

function scanChildren(dirPath) {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(dirPath, name, 'index.js')))
    .sort();
}

// A directory is a NAMESPACE (aggregator) if at least one of its
// subdirectories itself has an index.js. Leaf entity modules only have
// api/application/domain/infrastructure/events/cache/jobs/tests - none of
// which have their own index.js - so they're correctly left untouched.
function isNamespace(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  return scanChildren(dirPath).length > 0;
}

function walkAndRepair(dirPath, relPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true }).filter((e) => e.isDirectory());

  // Repair children first (bottom-up), so nested namespaces are fixed
  // before we decide whether THIS directory is a namespace.
  entries.forEach((entry) => {
    walkAndRepair(path.join(dirPath, entry.name), path.join(relPath, entry.name));
  });

  if (isNamespace(dirPath)) {
    const children = scanChildren(dirPath);
    fs.writeFileSync(path.join(dirPath, 'index.js'), templates.parentAggregatorIndex(children));
    console.log(`repaired: src/modules/${relPath || '.'}/index.js  (${children.length} children: ${children.join(', ')})`);
  }
}

const topLevel = fs.readdirSync(modulesRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
topLevel.forEach((entry) => {
  walkAndRepair(path.join(modulesRoot, entry.name), entry.name);
});

console.log('\nRepair complete.');
