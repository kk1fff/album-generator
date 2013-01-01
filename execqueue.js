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

var exec = require('child_process').exec,
    limit = 5,
    running = 0;

var cmdQueue = [];

function runQueue() {
  var queuedItem;
  if (running < limit) {
    while (!queuedItem && cmdQueue.length > 0) {
      queuedItem = cmdQueue.shift();
    }
    if (queuedItem) {
      running++;
      exec(queuedItem.cmd, function() {
        var args = Array.prototype.slice.call(arguments);
        // Callback, then run next task.
        queuedItem.cb.apply(this, args);
        running--;
        setTimeout(runQueue(), 0);
      });
    }
  }
};

exports.exec = function execEnqueue(cmd, callback) {
  cmdQueue.push({
    cmd: cmd,
    cb: callback
  });
  setTimeout(runQueue, 0);
};
