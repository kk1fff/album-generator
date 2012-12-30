// Copyright 2012 Patrick Wang <kk1fff@patrickz.net>
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

var EventEmitter = require('events').EventEmitter;
    fs           = require('fs'),
    cachedConfig = null;

function modifyConfig(data) {
  return {
    siteTitle: data.siteTitle,
    inputDir: __dirname + data.inputDir,
    outputDir: __dirname + data.outputDir,
    templateDir: __dirname + data.templateDir,
    pagePartDir: __dirname + data.pagePartDir,
    cssSourceDir: __dirname + data.cssSourceDir,
    albumFileName: data.albumFileName,
    httpPrefix: data.httpPrefix,
    thumbnailName: data.thumbnailName,
    imageSizes: data.imageSizes
  }
};

exports.getCachedConfig = function() {
  return cachedConfig;
}

exports.load = function load() {
  var e = new EventEmitter();

  if (!cachedConfig) {
    fs.readFile(__dirname + '/config.json', 'utf8', function(err, data) {
      if (err) {
        e.emit('error', err);
      } else {
        cachedConfig = modifyConfig(JSON.parse(data));
        e.emit('ok', cachedConfig);
      }
    });
  } else {
    setTimeout(e.emit.bind(e, 'ok', cachedConfig), 0);
  }

  return e;
}
