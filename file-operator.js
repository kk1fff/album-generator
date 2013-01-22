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

var fs           = require('fs'),
    EventEmitter = require('events').EventEmitter,
    config       = require('./config.js').getConfig();

// Error Log
var errorLog = [];

// Load all subdirectories from inputDir.
// @param onlyAlbumJsonDir true if we only need the list of directories
//                         that have album.json.
exports.fetchAlbumPath = function fetchAlbumPath(onlyAlbumJsonDir) {
  var e = new EventEmitter();

  fs.readdir(config.inputDir, function(err, files) {
    if (err) {
      e.emit('error', err);
      return;
    }

    var waitingStat = 0, dirList = [];

    // Handle getting file stat, whenever it is success or not.
    function onGotFileStat() {
      waitingStat--;
      if (waitingStat == 0) {
        e.emit('ok', dirList);
      }
    };

    files.forEach(function(file) {
      var filePath = config.inputDir + '/' + file;
      waitingStat++;
      fs.lstat(filePath, function(err, stat) {
        if (err || !stat.isDirectory()) {
          onGotFileStat();
          return;
        }

        if (onlyAlbumJsonDir) {
          // If the path is a directory, we will need to check if there's a
          // configure file in it.
          fs.lstat(filePath + '/' + config.albumFileName, function(err, stat) {
            if (stat && stat.isFile()) {
              dirList.push(filePath);
            }
            onGotFileStat();
          });
        } else {
          // Don't check album configure files, just callback.
          dirList.push(filePath);
          onGotFileStat();
        }
      });
    });
  });

  return e;
};
