const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');
const routeRegistryPath = path.join(srcDir, 'routes/routeRegistrynew.js');
const routesIndexPath = path.join(srcDir, 'indexes/routesIndex.js');

// 1. Initialize the Base Swagger/OpenAPI Object
const swaggerDoc = {
  openapi: '3.0.0',
  info: {
    title: 'Apex CRM API',
    description: 'Auto-generated API documentation extracted from backend routing definitions.',
    version: '1.0.0'
  },
  paths: {}
};

try {
  const registryContent = fs.readFileSync(routeRegistryPath, 'utf8');
  const indexContent = fs.readFileSync(routesIndexPath, 'utf8');
  
  // 2. Parse routesIndex.js
  const routeVars = {}; 
  const indexRegex = /([a-zA-Z0-9_]+):\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = indexRegex.exec(indexContent)) !== null) {
    const cleanPath = match[2].startsWith('../') ? match[2].slice(3) : match[2];
    routeVars[match[1]] = path.join(srcDir, cleanPath);
  }

  // 3. Parse routeRegistrynew.js
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

  // Helper function to append parsed routes to the Swagger object
  const addRouteToSwagger = (prefix, tag, method, endpoint, handler) => {
    let fullEndpoint = `${prefix}${endpoint === '/' ? '' : endpoint}`;
    
    // Convert Express params (/:id) to Swagger params (/{id})
    const swaggerPath = fullEndpoint.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
    const urlParams = [...fullEndpoint.matchAll(/:([a-zA-Z0-9_]+)/g)].map(m => m[1]);

    // Initialize path if it doesn't exist
    if (!swaggerDoc.paths[swaggerPath]) {
      swaggerDoc.paths[swaggerPath] = {};
    }

    // Build parameter schema
    const parameters = urlParams.map(param => ({
      name: param,
      in: 'path',
      required: true,
      schema: { type: 'string' }
    }));

    // Add operation to path
    swaggerDoc.paths[swaggerPath][method.toLowerCase()] = {
      tags: [tag],
      summary: `Handled by ${handler}`,
      parameters: parameters,
      responses: {
        '200': { description: 'Successful operation' }
      }
    };
  };

  // 4. Iterate through files and extract routes
  for (const routePrefix of prefixes) {
    if (!routePrefix.absPath || !fs.existsSync(routePrefix.absPath)) continue;
    
    const code = fs.readFileSync(routePrefix.absPath, 'utf8');
    
    // Create a neat tag name (e.g., 'authRoutes' -> 'Auth')
    const tag = routePrefix.routeVar.replace(/Routes|Router/i, '');
    const cleanTag = tag.charAt(0).toUpperCase() + tag.slice(1);

    // Look for standard `router.method('/path', ...)`
    const routerRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"][\s\S]*?(?=router\.(get|post|put|patch|delete|route)|module\.exports|$)/g;
    
    let rtMatch;
    while ((rtMatch = routerRegex.exec(code)) !== null) {
      const method = rtMatch[1];
      const endpoint = rtMatch[2];
      const controllerMatch = rtMatch[0].match(/([a-zA-Z0-9_]+Controller\.[a-zA-Z0-9_]+)/);
      const handler = controllerMatch ? controllerMatch[1] : 'Unknown Controller';
      
      addRouteToSwagger(routePrefix.prefix, cleanTag, method, endpoint, handler);
    }
    
    // Look for chain `.route('/path').get(...).post(...)`
    const chainRegex = /router\.route\s*\(\s*['"]([^'"]+)['"]\s*\)([\s\S]*?(?=router\.route|module\.exports|$))/g;
    let chainMatch;
    while ((chainMatch = chainRegex.exec(code)) !== null) {
      const endpoint = chainMatch[1];
      const block = chainMatch[2];
      
      const mRegex = /\.(get|post|put|patch|delete)\s*\([\s\S]*?(?=\.(get|post|put|patch|delete)|$)/g;
      let mMatch;
      while ((mMatch = mRegex.exec(block)) !== null) {
        const method = mMatch[1];
        const controllerMatch = mMatch[0].match(/([a-zA-Z0-9_]+Controller\.[a-zA-Z0-9_]+)/);
        const handler = controllerMatch ? controllerMatch[1] : 'Unknown Controller';
        
        addRouteToSwagger(routePrefix.prefix, cleanTag, method, endpoint, handler);
      }
    }
  }

  // 5. Write out the Swagger JSON
  const outPath = path.join(__dirname, '../artifacts/swagger.json');
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
  
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
