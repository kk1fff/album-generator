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

var exec = require('./execqueue.js').exec,
    EventEmitter = require('events').EventEmitter;

function getResizingCommand(fromFile, toFile, size, isThumbnail, isSquare) {
  var isJpeg = (toFile.match(/\.jpg$/i) != null),
      params = [],
      resizingPostFix = isSquare ? "^" : "\\>";

  if (isThumbnail) {
    params.push("-thumbnail " + size + "x" + size + resizingPostFix);
  } else {
    // Normal resize.
    params.push("-resize " + size + "x" + size + resizingPostFix);
    params.push("-strip");
    if (isJpeg) {
      params.push("-quality 60");
    }
  }

  if (isSquare) {
    params.push("-gravity center");
    params.push("-extent " + size + "x" + size);
  }

  return 'convert "' + fromFile + '" ' + params.join(' ') + ' "' + toFile + '"';
}

exports.processImage = function processImage(fromFile, toFile,
                                             size, isThumbnail, isSquare) {
  var e = new EventEmitter(),
      cmd = getResizingCommand(fromFile, toFile, size, isThumbnail, isSquare);

  exec(cmd,
       function (error, stdout, stderr) {
         if (error !== null) {
           console.log('Executing imagemagick error. command: ' +
                       cmd + ", error: " + error);
           e.emit('error', error);
         } else {
           e.emit('ok', toFile);
         }
       });

  return e;
}

