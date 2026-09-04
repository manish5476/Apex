const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function findRouteFiles(dir, fileList = []) {
  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findRouteFiles(fullPath, fileList);
    } else if (fullPath.endsWith('.routes.js') || fullPath.endsWith('routes.js')) {
      fileList.push(fullPath);
    }
  });
  return fileList;
}

const files = findRouteFiles(srcDir);

// Generate Headers for the Notion-friendly CSV
let csv = 'Module Name,File Name,Base Route,HTTP Method,Local Endpoint,Full API URL,Required Permission,Is Secured\n';

let totalRoutes = 0;
let securedRoutes = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  const fileName = path.basename(file);

  // 1. Smart Module Name Extraction
  const pathParts = file.split(path.sep);
  let moduleName = 'Core';

  const modulesIndex = pathParts.indexOf('modules');
  if (modulesIndex !== -1 && pathParts.length > modulesIndex + 1) {
    moduleName = pathParts[modulesIndex + 1];
  } else if (pathParts.includes('PublicModules')) {
    moduleName = 'Public Storefront';
  } else if (pathParts.includes('routes') && pathParts.includes('v1')) {
    moduleName = 'V1 Standard API';
  }

  // 2. Base Route Logic 
  let baseRouteName = fileName.replace('.routes.js', '').replace('routes.js', '');
  let baseRoute = `/api/v1/${baseRouteName}`;

  if (moduleName.toLowerCase() === 'webhook') {
    baseRoute = `/webhook`;
  } else if (moduleName === 'Public Storefront') {
    baseRoute = `/api/public`;
  }

  const blocks = content.split('router.');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    let matchFound = false;

    // Pattern 1: router.get('/path', ...)
    const methodMatch = block.match(/^(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/);
    if (methodMatch) {
      const method = methodMatch[1].toUpperCase();
      const endpoint = methodMatch[2];

      const permMatch = block.match(/checkPermission\s*\(\s*([^)]+)\s*\)/);
      const permission = permMatch ? permMatch[1].trim() : 'Public / Inherited';
      const secured = !!permMatch;

      let cleanEndpoint = endpoint === '/' ? '' : endpoint;
      if (cleanEndpoint && !cleanEndpoint.startsWith('/')) cleanEndpoint = '/' + cleanEndpoint;

      let fullUrl = `${baseRoute}${cleanEndpoint}`;

      // Write to CSV with safe quotes
      csv += `"${moduleName}","${fileName}","${baseRoute}","${method}","${endpoint}","${fullUrl}","${permission}","${secured ? 'Yes' : 'No'}"\n`;
      totalRoutes++;
      if (secured) securedRoutes++;
      matchFound = true;
    }

    // Pattern 2: router.route('/path').get(...).post(...)
    if (!matchFound) {
      const routeMatch = block.match(/^route\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (routeMatch) {
        const endpoint = routeMatch[1];
        const chainRegex = /\.(get|post|put|patch|delete)\s*\(/g;
        let match;
        let matches = [];

        while ((match = chainRegex.exec(block)) !== null) {
          matches.push({ method: match[1].toUpperCase(), index: match.index });
        }

        for (let j = 0; j < matches.length; j++) {
          const m = matches[j];
          const nextIndex = j + 1 < matches.length ? matches[j + 1].index : block.length;
          const subBlock = block.slice(m.index, nextIndex);

          const permMatch = subBlock.match(/checkPermission\s*\(\s*([^)]+)\s*\)/);
          const permission = permMatch ? permMatch[1].trim() : 'Public / Inherited';
          const secured = !!permMatch;

          let cleanEndpoint = endpoint === '/' ? '' : endpoint;
          if (cleanEndpoint && !cleanEndpoint.startsWith('/')) cleanEndpoint = '/' + cleanEndpoint;
          let fullUrl = `${baseRoute}${cleanEndpoint}`;

          csv += `"${moduleName}","${fileName}","${baseRoute}","${m.method}","${endpoint}","${fullUrl}","${permission}","${secured ? 'Yes' : 'No'}"\n`;
          totalRoutes++;
          if (secured) securedRoutes++;
        }
      }
    }
  }
});

fs.writeFileSync('api_report_for_notion.csv', csv);
console.log(`Successfully wrote to api_report_for_notion.csv. Total Routes: ${totalRoutes}, Secured: ${securedRoutes}`);