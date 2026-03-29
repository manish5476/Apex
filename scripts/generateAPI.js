// scripts/generateAPI.js
const fs = require('fs');
const path = require('path');
const m2s = require('mongoose-to-swagger');

const srcDir = path.join(__dirname, '../src');
const routeRegistryPath = path.join(srcDir, 'routes/routeRegistrynew.js');
const routesIndexPath = path.join(srcDir, 'indexes/routesIndex.js');

// 1. Initialize the Base Swagger/OpenAPI Object
const swaggerDoc = {
  openapi: '3.0.0',
  info: {
    title: 'Apex CRM API',
    description: 'Auto-generated API documentation extracted from backend routing and data models.',
    version: '1.0.0'
  },
  paths: {},
  components: {
    schemas: {}
  }
};

try {
  // === PHASE 1: EXTRACT MONGOOSE MODELS ===
  const walkSync = (dir, filelist = []) => {
    fs.readdirSync(dir).forEach(file => {
      const dirFile = path.join(dir, file);
      try {
        filelist = fs.statSync(dirFile).isDirectory() ? walkSync(dirFile, filelist) : filelist.concat(dirFile);
      } catch (err) { }
    });
    return filelist;
  };
  
  const allFiles = walkSync(srcDir);
  const modelFiles = allFiles.filter(f => f.endsWith('.model.js') || f.endsWith('Model.js'));

  console.log(`Scanning ${modelFiles.length} Mongoose models for Schema Generation...`);
  
  // Note: we just parse the source files to extract model names/fields if require fails, 
  // but requiring them locally works well for m2s unless they have severe dependencies.
  for (const modelPath of modelFiles) {
    try {
      const model = require(path.resolve(modelPath));
      if (model && model.modelName && model.schema) {
        const swaggerSchema = m2s(model);
        swaggerDoc.components.schemas[model.modelName] = swaggerSchema;
      }
    } catch(err) {
      // ignore require errors (like missing DB connection constraints)
    }
  }

  // === PHASE 2: EXTRACT ROUTES ===
  const registryContent = fs.readFileSync(routeRegistryPath, 'utf8');
  const indexContent = fs.readFileSync(routesIndexPath, 'utf8');
  
  const routeVars = {}; 
  const indexRegex = /([a-zA-Z0-9_]+):\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = indexRegex.exec(indexContent)) !== null) {
    const cleanPath = match[2].startsWith('../') ? match[2].slice(3) : match[2];
    routeVars[match[1]] = path.join(srcDir, cleanPath);
  }

  const prefixes = []; 
  const registryLines = registryContent.split('\n');
  for (const line of registryLines) {
    let pMatch = line.match(/app\.use\s*\(\s*(?:`\$\{v1Prefix\}|['"]\/api\/v1)([^'"`]*)[^\)]*,\s*routes\.([a-zA-Z0-9_]+)\s*\)/);
    if (pMatch) {
      prefixes.push({ prefix: `/api/v1${pMatch[1]}`, routeVar: pMatch[2], absPath: routeVars[pMatch[2]] });
    } else {
      pMatch = line.match(/app\.use\s*\(\s*`([^`]+)`,\s*routes\.([a-zA-Z0-9_]+)\s*\)/);
      if (pMatch && routeVars[pMatch[2]]) {
        prefixes.push({ prefix: pMatch[1], routeVar: pMatch[2], absPath: routeVars[pMatch[2]] });
      }
    }
  }

  const addRouteToSwagger = (prefix, tag, method, endpoint, handler) => {
    let fullEndpoint = `${prefix}${endpoint === '/' ? '' : endpoint}`;
    const swaggerPath = fullEndpoint.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
    const urlParams = [...fullEndpoint.matchAll(/:([a-zA-Z0-9_]+)/g)].map(m => m[1]);

    if (!swaggerDoc.paths[swaggerPath]) swaggerDoc.paths[swaggerPath] = {};

    const parameters = urlParams.map(param => ({
      name: param,
      in: 'path',
      required: true,
      schema: { type: 'string' }
    }));

    // Auto-link to schemas if tag matches Model name roughly
    let reqBody = undefined;
    let successResponse = { description: 'Successful operation' };
    
    // Attempt schema coupling
    const manualMap = {
      'Auth': 'User',
      'Users': 'User',
      'Roles': 'Role',
      'Products': 'Product',
      'Customers': 'Customer',
      'Suppliers': 'Supplier',
      'Purchases': 'Purchase',
      'Sales': 'Sales',
      'Invoices': 'Invoice'
    };

    let possibleSchemaName = Object.keys(swaggerDoc.components.schemas).find(
       s => s.toLowerCase() === tag.toLowerCase() 
         || tag.toLowerCase().includes(s.toLowerCase()) 
         || s.toLowerCase().includes({ 'y': 'ies', 's': '' }[tag.slice(-1)] ? tag.slice(0, -1).toLowerCase() : 'xxx')
    );

    if (manualMap[tag] && swaggerDoc.components.schemas[manualMap[tag]]) {
       possibleSchemaName = manualMap[tag];
    }

    if (['post', 'put', 'patch'].includes(method.toLowerCase())) {
        reqBody = {
            content: {
                'application/json': { 
                    schema: possibleSchemaName 
                        ? { $ref: `#/components/schemas/${possibleSchemaName}` }
                        : { type: 'object', description: 'JSON Payload' }
                }
            }
        };
    }

    if (possibleSchemaName) {
       successResponse = {
         description: `Returns ${possibleSchemaName} data.`,
         content: { 'application/json': { schema: { $ref: `#/components/schemas/${possibleSchemaName}` } } }
       };
    }

    swaggerDoc.paths[swaggerPath][method.toLowerCase()] = {
      tags: [tag],
      summary: `Handled by ${handler}`,
      parameters: parameters,
      requestBody: reqBody,
      responses: {
        '200': successResponse
      }
    };
  };

  for (const routePrefix of prefixes) {
    if (!routePrefix.absPath || !fs.existsSync(routePrefix.absPath)) continue;
    
    const code = fs.readFileSync(routePrefix.absPath, 'utf8');
    const tag = routePrefix.routeVar.replace(/Routes|Router/i, '');
    const cleanTag = tag.charAt(0).toUpperCase() + tag.slice(1);

    const routerRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"][\s\S]*?(?=router\.(get|post|put|patch|delete|route)|module\.exports|$)/g;
    let rtMatch;
    while ((rtMatch = routerRegex.exec(code)) !== null) {
      const method = rtMatch[1];
      const endpoint = rtMatch[2];
      const controllerMatch = rtMatch[0].match(/([a-zA-Z0-9_]+Controller\.[a-zA-Z0-9_]+)/);
      addRouteToSwagger(routePrefix.prefix, cleanTag, method, endpoint, controllerMatch ? controllerMatch[1] : 'Unknown Controller');
    }
    
    const chainRegex = /router\.route\s*\(\s*['"]([^'"]+)['"]\s*\)([\s\S]*?(?=router\.route|module\.exports|$))/g;
    let chainMatch;
    while ((chainMatch = chainRegex.exec(code)) !== null) {
      const endpoint = chainMatch[1];
      const mRegex = /\.(get|post|put|patch|delete)\s*\([\s\S]*?(?=\.(get|post|put|patch|delete)|$)/g;
      let mMatch;
      while ((mMatch = mRegex.exec(chainMatch[2])) !== null) {
        const controllerMatch = mMatch[0].match(/([a-zA-Z0-9_]+Controller\.[a-zA-Z0-9_]+)/);
        addRouteToSwagger(routePrefix.prefix, cleanTag, mMatch[1], endpoint, controllerMatch ? controllerMatch[1] : 'Unknown Controller');
      }
    }
  }

  const outPath = path.join(__dirname, '../artifacts/swagger.json');
  fs.writeFileSync(outPath, JSON.stringify(swaggerDoc, null, 2));
  console.log('Swagger JSON generated at', outPath);

} catch (e) {
  console.error('Error generating Swagger report:', e);
}

// const fs = require('fs');
// const path = require('path');

// const srcDir = path.join(__dirname, '../src');
// const routeRegistryPath = path.join(srcDir, 'routes/routeRegistrynew.js');
// const routesIndexPath = path.join(srcDir, 'indexes/routesIndex.js');

// let report = '# Apex CRM Comprehensive API Routing Report\n\nThis report automatically extracts all active endpoints from the backend source routing definitions, alongside their HTTP Methods and URL path parameters.\n\n';

// try {
//   const registryContent = fs.readFileSync(routeRegistryPath, 'utf8');
//   const indexContent = fs.readFileSync(routesIndexPath, 'utf8');
  
//   // parse routesIndex.js
//   const routeVars = {}; 
//   const indexRegex = /([a-zA-Z0-9_]+):\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
//   let match;
//   while ((match = indexRegex.exec(indexContent)) !== null) {
//     // E.g. match[1] = authRoutes, match[2] = '../routes/v1/auth.routes.js'
//     const cleanPath = match[2].startsWith('../') ? match[2].slice(3) : match[2];
//     routeVars[match[1]] = path.join(srcDir, cleanPath);
//   }

//   // parse routeRegistrynew.js
//   const prefixes = []; 
//   const registryLines = registryContent.split('\n');
//   for (const line of registryLines) {
//     if (line.includes('app.use') && line.includes('routes.')) {
//         // e.g. app.use(`${v1Prefix}/auth`, routes.authRoutes);
//         const pMatch = line.match(/app\.use\s*\(\s*(?:`\$\{v1Prefix\}|['"]\/api\/v1)([^'"`]*)[^\)]*,\s*routes\.([a-zA-Z0-9_]+)\s*\)/);
//         if (pMatch) {
//             const prefix = `/api/v1${pMatch[1]}`;
//             const routeVar = pMatch[2];
//             const absPath = routeVars[routeVar];
//             if (absPath) {
//                 prefixes.push({ prefix, routeVar, absPath });
//             }
//         } else {
//             // direct path match like app.use(`/api/v1/store`, routes.storefrontPublicRoutes);
//             const hardMatch = line.match(/app\.use\s*\(\s*`([^`]+)`,\s*routes\.([a-zA-Z0-9_]+)\s*\)/);
//             if (hardMatch) {
//                 const absPath = routeVars[hardMatch[2]];
//                 if (absPath) {
//                     prefixes.push({ prefix: hardMatch[1], routeVar: hardMatch[2], absPath });
//                 }
//             }
//         }
//     }
//   }

//   for (const routePrefix of prefixes) {
//     report += `## ${routePrefix.prefix} Routes\n`;
//     report += `*Source Location: /src/${routePrefix.absPath.split('src\\')[1] || routePrefix.absPath}*\n\n`;
//     report += `| Method | Endpoint Path | URL Parameters & Route Handler |\n`;
//     report += `|--------|---------------|----------------------------------|\n`;

//     if (fs.existsSync(routePrefix.absPath)) {
//       const code = fs.readFileSync(routePrefix.absPath, 'utf8');
      
//       // Look for standard `router.method('/path', ...)`
//       const routerRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"][\s\S]*?(?=router\.(get|post|put|patch|delete|route)|module\.exports|$)/g;
      
//       let rtMatch;
//       let endpointsFound = false;
//       while ((rtMatch = routerRegex.exec(code)) !== null) {
//         endpointsFound = true;
//         const method = rtMatch[1].toUpperCase();
//         let endpoint = rtMatch[2];
//         if (endpoint === '/') endpoint = '';
//         const fullEndpoint = `${routePrefix.prefix}${endpoint}`;
        
//         const block = rtMatch[0];
//         // extract handler
//         const controllerMatch = block.match(/([a-zA-Z0-9_]+Controller\.[a-zA-Z0-9_]+)/);
//         const handler = controllerMatch ? controllerMatch[1] : 'Unknown Controller Method';

//         // Extract path parameters
//         const urlParams = [...endpoint.matchAll(/:([a-zA-Z0-9_]+)/g)].map(m => m[1]);
//         const paramStr = urlParams.length > 0 ? `**URL Params:** ` + urlParams.map(p => `\`${p}\``).join(', ') : '*(No URL parameters)*';

//         report += `| **${method}** | \`${fullEndpoint}\` | ${paramStr} <br/> Handler: \`${handler}\` |\n`;
//       }
      
//       // Look for chain `.route('/path').get(...).post(...)`
//       const chainRegex = /router\.route\s*\(\s*['"]([^'"]+)['"]\s*\)([\s\S]*?(?=router\.route|module\.exports|$))/g;
//       let chainMatch;
//       while ((chainMatch = chainRegex.exec(code)) !== null) {
//           endpointsFound = true;
//           let endpoint = chainMatch[1];
//           if (endpoint === '/') endpoint = '';
//           const fullEndpoint = `${routePrefix.prefix}${endpoint}`;
//           const block = chainMatch[2];
          
//           const mRegex = /\.(get|post|put|patch|delete)\s*\([\s\S]*?(?=\.(get|post|put|patch|delete)|$)/g;
//           let mMatch;
//           while ((mMatch = mRegex.exec(block)) !== null) {
//               const method = mMatch[1].toUpperCase();
//               const subBlock = mMatch[0];
//               const cMatch = subBlock.match(/([a-zA-Z0-9_]+Controller\.[a-zA-Z0-9_]+)/);
//               const handler = cMatch ? cMatch[1] : 'Unknown Controller Method';
//               const urlParams = [...endpoint.matchAll(/:([a-zA-Z0-9_]+)/g)].map(m => m[1]);
//               const paramStr = urlParams.length > 0 ? `**URL Params:** ` + urlParams.map(p => `\`${p}\``).join(', ') : '*(No URL parameters)*';
              
//               report += `| **${method}** | \`${fullEndpoint}\` | ${paramStr} <br/> Handler: \`${handler}\` |\n`;
//           }
//       }

//       if (!endpointsFound) {
//           report += `| - | - | *Endpoints defined dynamically or not detected by regex* |\n`;
//       }
//       report += '\n';

//     } else {
//       report += `| - | - | *Route file not found at path* |\n\n`;
//     }
//   }

//   const outPath = path.join(__dirname, '../artifacts/routes_report.md');
//   const dir = path.dirname(outPath);
//   if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
//   fs.writeFileSync(outPath, report);
//   console.log('Report generated at', outPath);

// } catch (e) {
//   console.error(e);
// }
