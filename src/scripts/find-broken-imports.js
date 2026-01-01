// src/scripts/find-broken-imports.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // src root

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      walk(full, files);
    } else if (file.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function resolveImport(fromFile, importPath) {
  if (
    importPath.startsWith('@') ||          // aliases
    !importPath.startsWith('.')             // node_modules
  ) return true;

  const base = path.dirname(fromFile);
  const full = path.resolve(base, importPath);

  return (
    fs.existsSync(full) ||
    fs.existsSync(full + '.js') ||
    fs.existsSync(path.join(full, 'index.js'))
  );
}

const broken = [];

for (const file of walk(ROOT)) {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.matchAll(/require\(['"](.+?)['"]\)/g);

  for (const m of matches) {
    const imp = m[1];
    if (!resolveImport(file, imp)) {
      broken.push({ file, imp });
    }
  }
}

if (!broken.length) {
  console.log('✔ No broken imports');
  process.exit(0);
}

console.log('\n❌ Broken imports:\n');
for (const b of broken) {
  console.log(`File: ${b.file}`);
  console.log(`Import: ${b.imp}\n`);
}


// const fs = require('fs');
// const path = require('path');

// const ROOT = path.resolve(__dirname, '..');

// if (!fs.existsSync(ROOT)) {
//   console.error('❌ ROOT does not exist:', ROOT);
//   process.exit(1);
// }

// function walk(dir, files = []) {
//   for (const file of fs.readdirSync(dir)) {
//     const full = path.join(dir, file);
//     if (fs.statSync(full).isDirectory()) {
//       walk(full, files);
//     } else if (file.endsWith('.js')) {
//       files.push(full);
//     }
//   }
//   return files;
// }

// function resolveImport(fromFile, importPath) {
//   if (!importPath.startsWith('.')) return true;

//   const base = path.dirname(fromFile);
//   const full = path.resolve(base, importPath);

//   return (
//     fs.existsSync(full) ||
//     fs.existsSync(full + '.js') ||
//     fs.existsSync(path.join(full, 'index.js'))
//   );
// }

// const broken = [];

// for (const file of walk(ROOT)) {
//   const content = fs.readFileSync(file, 'utf8');

//   const matches = content.matchAll(/require\(['"](.+?)['"]\)/g);
//   for (const m of matches) {
//     const imp = m[1];
//     if (!resolveImport(file, imp)) {
//       broken.push({ file, imp });
//     }
//   }
// }

// if (!broken.length) {
//   console.log('✔ No broken imports');
//   process.exit(0);
// }

// console.log('\n❌ Broken imports found:\n');
// for (const b of broken) {
//   console.log(`File: ${b.file}`);
//   console.log(`Import: ${b.imp}\n`);
// }
