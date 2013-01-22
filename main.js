// Copyright 2012, 2013 Patrick Wang <kk1fff@patrickz.net>
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var fs             = require('fs'),
    EventEmitter   = require('events').EventEmitter,
    mkdirp         = require('mkdirp'),
    wrench         = require('wrench'),
    AlbumProcessor = require('./albums.js'),
    config         = require('./config.js').getConfig();

// Error Log
var errorLog = [];

function deployCss() {
  var e = new EventEmitter(),
      deployingFile = 0;

  function onDeployedOneFile() {
    deployingFile--;
    if (deployingFile == 0) {
      e.emit('ok');
    }
  }

  mkdirp.sync(config.outputDir + '/css');

  fs.readdir(config.cssSourceDir, function(err, csses) {
    if (err) {
      e.emit('error', err);
    } else {
      // 1. Read css sourece dir for all css file.
      // 2. For each entry, test if it is a regular file. If so, we assume it is a css file.
      // 3. For each file, read its content.
      // 4. Write its content into output directory.
      csses.forEach(function(cssFile) {
        deployingFile++;
        var file = config.cssSourceDir + "/" + cssFile;
        fs.lstat(file, function(err, stat) {
          if (stat.isFile()) {
            fs.readFile(file, 'utf8', function(err, data) {
              fs.writeFile(config.outputDir + "/css/" + cssFile, data, function(err) {
                if (err) {
                  e.emit('error', err);
                  onDeployedOneFile();
                } else {
                  onDeployedOneFile();
                }
              });
            });
          }
        });
      });
    }
  });

  return e;
}

function deployJs() {
  var e = new EventEmitter(),
      deployingFile = 0;

  function onDeployedOneFile() {
    deployingFile--;
    if (deployingFile == 0) {
      e.emit('ok');
    }
  }

  mkdirp.sync(config.outputDir + '/js');

  fs.readdir(config.jsSourceDir, function(err, jses) {
    if (err) {
      e.emit('error', err);
    } else {
      // 1. Read css sourece dir for all js file.
      // 2. For each entry, test if it is a regular file. If so, we assume it is a js file.
      // 3. For each file, read its content.
      // 4. Write its content into output directory.
      jses.forEach(function(jsFile) {
        deployingFile++;
        var file = config.jsSourceDir + "/" + jsFile;
        fs.lstat(file, function(err, stat) {
          if (stat.isFile()) {
            fs.readFile(file, 'utf8', function(err, data) {
              fs.writeFile(config.outputDir + "/js/" + jsFile, data, function(err) {
                if (err) {
                  e.emit('error', err);
                  onDeployedOneFile();
                } else {
                  onDeployedOneFile();
                }
              });
            });
          }
        });
      });
    }
  });

  return e;
}

function prepareDirectory() {
  var e = new EventEmitter();

  function copyResource() {
    wrench.rmdirRecursive(config.outputDir + '/res', function(err) {
      if (err && err.code != 'ENOENT') {
        console.error("Cannot remove old res folder: " + err);
        e.emit('error', err);
      } else {
        wrench.copyDirRecursive(__dirname + '/res', config.outputDir + '/res', function(err) {
          if (err && err.code != 'ENOENT') {
            console.error("Cannot deploy res folder: " + err);
            e.emit('error', err);
            return;
          } 

          e.emit('ok');
        });
      }
    });
  }

  function toDeployJs() {
    var ee = deployJs();
    ee.on('ok', function() {
      copyResource();
    });

    ee.on('error', function(err) {
      e.emit('error', err);
    });
  }

  function toDeployCss() {
    var ee = deployCss();
    ee.on('ok', function() {
      toDeployJs();
    });

    ee.on('error', function(err) {
      e.emit('error', err);
    });
  }

  mkdirp(config.outputDir, function(err) {
    if (err) {
      e.emit('error', err);
    } else {
      toDeployCss();
    }
  });

  return e;
}

function run() {
  var ee = prepareDirectory();
  ee.on('ok', function() {
    AlbumProcessor.processAlbums();
  });
  ee.on('error', function(err) {
    console.log('Error when preparing environment: ' + err);
  });
}

run();
