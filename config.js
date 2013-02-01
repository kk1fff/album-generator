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

var EventEmitter = require('events').EventEmitter,
    fs           = require('fs'),
    cachedConfig = null;

function modifyConfig(data) {
  return {
    albumFileName: data.albumFileName,
    cssSourceDir: __dirname + data.cssSourceDir,
    disqus: data.disqus,
    googleanalystics: data.googleanalystics,
    httpPrefix: data.httpPrefix,
    images: data.images,
    inputDir: __dirname + data.inputDir,
    jsSourceDir: __dirname + data.jsSourceDir,
    outputDir: __dirname + data.outputDir,
    pagePartDir: __dirname + data.pagePartDir,
    photoName: data.photoName,
    siteTitle: data.siteTitle,
    templateDir: __dirname + data.templateDir,
    albumThumbnailName: data.albumThumbnailName,
    photoThumbnailName: data.photoThumbnailName,
    littleThumbnailName: data.littleThumbnailName,
    albumsPerPage: data.albumsPerPage,
    facebookapp: data.facebookapp
  };
};

exports.getConfig = function() {
  if (!cachedConfig) {
    cachedConfig = modifyConfig(JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8')));
  }
  return cachedConfig;
};

