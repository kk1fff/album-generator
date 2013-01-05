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

var fsOp = require('./file-operator.js'),
    util = require('./util.js'),
    config;

function generateAlbumListPreview() {
  var ee = fsOp.fetchAlbumPath();
  ee.on('ok', function(dirList) {
    dirList.sort();
    console.log(dirList.join('\n'));
  });
  ee.on('error', util.printErr);
}

function run() {
  generateAlbumListPreview();
}

var loadingConfig = require('./config.js').load();

loadingConfig.on('ok', function(conf) {
  config = conf;
  run();
});

loadingConfig.on('error', function(err) {
  console.error('Fail to load configure: ' + err);
});
