const moduleAlias = require('module-alias');
const path = require('path');

moduleAlias.addAliases({
  '@core': path.resolve(__dirname, '../core'),
  '@modules': path.resolve(__dirname, '../modules'),
  '@config': path.resolve(__dirname, '../config'),
  '@shared': path.resolve(__dirname, '../shared'),
  '@routes': path.resolve(__dirname, '../routes'),
});