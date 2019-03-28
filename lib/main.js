'use strict';

var path = require('path');
var pack = require('../package.json');
var binding_path = path.join(
  __dirname,
  '../build/fuzzy-native/',
  'v' + pack.version,
  // ABI v57 is only for Electron. https://github.com/electron/electron/issues/5851
  process.versions.modules === '57'
    ? ['electron', 'v2.0', process.platform, process.arch].join('-')
    : ['node', 'v' + process.versions.modules, process.platform, process.arch].join('-'),
  'fuzzy-native.node'
);

module.exports = require(binding_path);
