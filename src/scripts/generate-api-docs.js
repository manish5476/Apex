const app = require('../app');
const fs = require('fs');
const path = require('path');

function getEndpoints(app) {
  const routes = [];
  
  function print(path, layer) {
    if (layer.route) {
      layer.route.stack.forEach(print.bind(null, path.concat(split(layer.route.path))))
    } else if (layer.name === 'router' && layer.handle.stack) {
      layer.handle.stack.forEach(print.bind(null, path.concat(split(layer.regexp))))
    } else if (layer.method) {
      const method = layer.method.toUpperCase();
      let fullPath = path.concat(split(layer.regexp)).filter(Boolean).join('/');
      if (!fullPath.startsWith('/')) fullPath = '/' + fullPath;
      // Cleanup express regex strings
      fullPath = fullPath
        .replace(/\\/g, '')
        .replace(/\?\(\?=\/\|\$\)/g, '')
        .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, '')
        .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, '')
        .replace(/\(\?\:\(\[\^\\\/\]\+\?\)\)/g, '')
        .replace(/\/\^\\\//, '/')
        .replace(/\/\?\(\?=\\\/\|\$\)\^/, '')
        .replace(/\/\?\(\?=\/\|\$\)/, '')
        .replace(/\^/, '')
        .replace(/\$\/\?i/, '')
        .replace(/\/\//g, '/');

      routes.push({ method, path: fullPath });
    }
  }

  function split(thing) {
    if (typeof thing === 'string') {
      return thing.split('/')
    } else if (thing.fast_slash) {
      return ''
    } else {
      var match = thing.toString()
        .replace('\\/?', '')
        .replace('(?=\\/|$)', '')
        .match(/^\/\^((?:\\[.*+?^${}()|[\]\\\/]|[^.*+?^${}()|[\]\\\/])*)\$\//)
      return match
        ? match[1].replace(/\\(.)/g, '$1').split('/')
        : '<complex:' + thing.toString() + '>'
    }
  }

  app._router.stack.forEach(print.bind(null, []))
  
  // Deduplicate
  const uniqueRoutes = Array.from(new Set(routes.map(r => `${r.method} ${r.path}`)))
    .map(r => {
      const [method, ...rest] = r.split(' ');
      return { method, path: rest.join(' ') };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
    
  return uniqueRoutes;
}

try {
  const routes = getEndpoints(app);
  let md = '# Apex CRM & Storefront API Reference\n\n';
  md += 'This document is auto-generated directly from the Express application router and contains **100% of the active API endpoints**.\n\n';
  
  let currentModule = '';
  
  routes.forEach(route => {
    // Determine module from path (e.g., /api/inventory/sales -> inventory)
    let mod = route.path.split('/')[2] || 'core';
    if (mod !== currentModule) {
      currentModule = mod;
      md += `\n## Module: \`${currentModule.toUpperCase()}\`\n`;
      md += `| Method | Endpoint |\n`;
      md += `|---|---|\n`;
    }
    
    // Format path to fix up regex output for params
    let cleanPath = route.path
      .replace(/<complex:.*?>/g, ':param')
      .replace(/\/\//g, '/');
      
    md += `| **${route.method}** | \`${cleanPath}\` |\n`;
  });

  const outputPath = path.join(__dirname, '..', 'backend_api_reference.md');
  fs.writeFileSync(outputPath, md);
  console.log('Successfully generated API reference at: ' + outputPath);
  console.log(`Found ${routes.length} endpoints.`);
} catch (err) {
  console.error(err);
}
