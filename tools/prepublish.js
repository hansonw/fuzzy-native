/**
 * Based on https://github.com/node-inspector/v8-profiler/blob/5a6a00d/tools/prepublish.js
 */
'use strict';

if (process.env.CI) process.exit(0);

if (process.env.npm_config_argv) {
  var npm_argv = JSON.parse(process.env.npm_config_argv);
  if (npm_argv.original[0] !== 'publish') process.exit(0);
}

var gyp = require('node-pre-gyp');
var rimraf = require('rimraf');

rimraf.sync('./build');

var versions = [
  '0.12.0',
  '2.0.0',
  '3.0.0',
  '4.0.0',
  '5.0.0'
];
var matrix = {
  x64: ['linux', 'darwin'],
  ia32: ['darwin']
};

var targets = [];
Object.keys(matrix).forEach(function(arch) {
  matrix[arch].forEach(function(platform) {
    versions.forEach(function(version) {
      targets.push({
        target: version,
        target_platform: platform,
        target_arch: arch
      });
    });
  });
});

(function next(err) {
  if (err) {
    console.log(err.message);
    process.exit(1);
  }
  var target = targets.pop();
  if (!target) process.exit(0);
  var prog = new gyp.Run();
  prog.opts = target;
  prog.commands.install([], next);
})();
