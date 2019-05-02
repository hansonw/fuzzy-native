'use strict';

var path = require('path');
var pack = require('../package.json');
var binding_path = path.join(
  __dirname,
  '../build/fuzzy-native/',
  'v' + pack.version,
  'fuzzy-native.node'
);

module.exports = require(binding_path);
