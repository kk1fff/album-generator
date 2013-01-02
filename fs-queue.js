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

var fs      = require('fs'),
    limit   = 2,
    running = 0;

var fsQueue = [];

function runQueue() {
  var queuedItem, wrappedCallback;
  if (running < limit) {
    while (!queuedItem && fsQueue.length > 0) {
      queuedItem = fsQueue.shift();
    }
    if (queuedItem) {
      running++;
      wrappedCallback = function() {
        var args = Array.prototype.slice.call(arguments);
        // Callback, then run next task.
        queuedItem.cb.apply(this, args);
        running--;
        setTimeout(runQueue, 0);
      };
      if (queuedItem.type) {
        fs.writeFile(queuedItem.file, queuedItem.data, queuedItem.type, wrappedCallback);
      } else {
        fs.writeFile(queuedItem.file, queuedItem.data, wrappedCallback);
      }
    }
  }
};

exports.writeFile = function writeFileEqueue(file, data, typeOrCallback, callback) {
  var type;
  if (typeof(typeOrCallback) == 'function') {
    callback = typeOrCallback;
  } else {
    type = typeOrCallback;
  }
  fsQueue.push({
    file: file,
    data: data,
    type: type,
    cb: callback
  });
  setTimeout(runQueue, 0);
};
