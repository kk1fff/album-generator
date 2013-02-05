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
      queuedItem.func.apply(queuedItem.obj, queuedItem.args);
    }
  }
};

function wrapCallback(callback) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    // call callback function, then run next task.
    callback.apply(this, args);
    running--;
    setTimeout(runQueue, 0);
  };
}

function fsQueueAdd(queuedItem) {
  fsQueue.push(queuedItem);
  setTimeout(runQueue, 0);
}

function getFileHash(hash, path, callback) {
  var stream = fs.createReadStream(path);
  stream.on('data', function(d) {
    hash.update(d);
  });
  stream.on('end', function() {
    stream.destroy();
  });
  stream.on('close', function() {
    callback(null, hash);
  });
}

exports.writeFile = function writeFileEqueue(file, data, typeOrCallback, callback) {
  var args = [file, data];
  if (typeof(typeOrCallback) == 'function') {
    args.push(wrapCallback(typeOrCallback));
  } else {
    args.push(typeOrCallback);
    args.push(wrapCallback(callback));
  }

  fsQueueAdd({
    func: fs.writeFile,
    obj: fs,
    args: args
  });
};

exports.getHash = function getHash(hash, path) {
  var emitter = new EventEmitter(),
      args = [hash, path];
  args.push(wrapCallback(function(err, hash) {
    if (err) {
      emitter.emit('error', err);
    } else {
      emitter.emit('ok', hash);
    }
  }));
  fsQueueAdd({
    func: getFileHash,
    obj: null,
    args: args});
  return emitter;
};

exports.mkdir = function mkdir(path, mode, callback) {
  fsQueueAdd({
    func: fs.mkdir,
    obj: fs,
    args: [path, mode, wrapCallback(callback)]
  });
};
