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

//  1. Create a folder in output dir, with the name is the new photo name.
//  2. Resize the photo into the photo folder.
//  3. Read add additional information (EXIF) and write to the photo folder.
//  4. Generate page for that photo.

var crypto        = require('crypto'),
    EventEmitter  = require('events').EventEmitter,
    mkdirp        = require('mkdirp'),
    ii            = require('./imagemagick-interface.js'),
    ei            = require('./exiftool-interface.js'),
    generatePage  = require('./template-interface.js').generatePage,
    fsQueue       = require('./fs-queue.js'),
    tagging       = require('./tagging.js'),
    config        = null,
    newNameQueue       = [],
    runningNewNameTask = 0,
    newNameTaskLimit   = 5,
    photoInfoMap  = {}; // Name to info map.

// Resize to specified size.
function shrink(pi) {
  var waitingShrinking = 0;
  var e = new EventEmitter();
  function onShrunk() {
    waitingShrinking--;
    if (waitingShrinking == 0) {
      e.emit('ok');
    }
  }
  config.imageSizes.forEach(function (size) {
    waitingShrinking++;
    console.log("Shrink " + pi.originalFilePathName + " to " + size + "px");
    var ee = ii.shrinkSize(size, pi.originalFilePathName, pi.photoDir + "/" + size + ".jpg");
    ee.on('ok', function() {
      onShrunk();
    });
    ee.on('error', function(err) {
      console.error(err);
      e.emit('error', err);
      onShrunk();
    });
  });

  // Square images
  config.squareImageSizes.forEach(function (size) {
    waitingShrinking++;
    console.log("Shrink " + pi.originalFilePathName + " to " + size + "px");
    var ee = ii.squareThumbnail(size, pi.originalFilePathName, pi.photoDir + "/" + size + "s.jpg");
    ee.on('ok', function() {
      onShrunk();
    });
    ee.on('error', function(err) {
      console.error(err);
      e.emit('error', err);
      onShrunk();
    });
  });

    
  return e;
};

function addTagsOfPhoto(pi) {
  pi.tags.forEach(function(tag) {
    tagging.addTag(pi.name, tag);
  });
}

function getExif(pi) {
  var ee = ei.getExif(pi.originalFilePathName);
  ee.on('ok', function(exif, tag) {
    /* Add additional info to photo */
    pi.exif = exif;
    pi.tags = pi.tags.concat(tag);
    pi.thumbnailUrl = config.httpPrefix + "/" + pi.name + "/" + config.thumbnailName;
    pi.littleThumbnailUrl = config.httpPrefix + "/" + pi.name + "/" + config.littleThumbnailName;
    pi.pageUrl = config.httpPrefix + "/" + pi.name + "/";

    addTagsOfPhoto(pi);
    photoInfoMap[pi.name] = pi;
    pi.emitter.emit('ok', pi);
  });
  ee.on('error', function(err) {
    pi.emitter.emit('error', err);
  });
}

function createPhotoDir(pi) {
  fs.mkdir(pi.photoDir, "755", function(err) {
    if (err) {
      // This photo is already be used in other album. It's ok, we can skip
      // all futher file operations to this file and jump to exif directly.
      if (err.code == 'EEXIST') {
        getExif(pi);
        return;
      }

      pi.emitter.emit('error', err);
      return;
    }

    // Right now we have a folder for the picture, we will create shrunk
    // version and web page and place them into this folder.
    var shrinking = shrink(pi);
    shrinking.on('ok', function() {
      getExif(pi);
    });
    shrinking.on('error', function(err) {
      pi.emitter.emit('error', err);
    });
  });
};

function getNewName(photoInfo) {
  
  function done() {
    runningNewNameTask--;
    setTimeout(deque, 0);
  }

  function doGetNewName(pi) {
    var sha1 = crypto.createHash('sha1'),
        stream = fs.createReadStream(pi.originalFilePathName);

    // We take title and desc into hash code, so the same photos but with different
    // titles and descs will be different folder.
    if (pi.title) sha1.update(pi.title);
    if (pi.desc) sha1.update(pi.desc);

    stream.on('data', function(d) {
      sha1.update(d);
    });

    stream.on('end', function() {
      pi.name = "photo-" + pi.albumName + "-" + sha1.digest('hex');
      pi.photoDir = config.outputDir + '/' + pi.name;
      done();
      createPhotoDir(pi);
    });

    stream.on('error', function(err) {
      done();
      pi.emitter.emit('error', err);
    });
  }

  function deque() {
    var newNameTask;
    if (runningNewNameTask < newNameTaskLimit) {
      while (!newNameTask && newNameQueue.length > 0) {
        newNameTask = newNameQueue.shift();
      }
      if (newNameTask) {
        runningNewNameTask++;
        doGetNewName(newNameTask.photoInfo);
      }
    }
  }

  newNameQueue.push({
    photoInfo: photoInfo
  });

  setTimeout(deque, 0);
}

// This function expects an input:
// {
//   albumPath: input path of album.
//   albumName: album's unique name.
//   photoFileName: photo's input file. (name only, no path)
//   photoTitle: photo title.
//   photoDescription: photo's description.
// }
// This function returns an event emitter. The event emitter is guaranteed
// to be called at least once.
// There are 2 events: 'ok' and 'error'.
// 'ok' is called when the process is done. the call back is function(photoInfo)
// A photoInfo object contains:
// {
//   title:     Photo title
//   desc:      Photo description
//   name:      Name of the output photo folder.
//   albumName: Unique name of the album that contains this photo.
//   exif:      A map of exif, if the photo contains exif information.
//   tags:      A list of tag of th photo.
// }
// 'error' is called when error occurs, with an error object.
exports.processPhoto = function processPhoto(initPhotoInfo) {
  var e = new EventEmitter(),
      photoInfo = {
        title: initPhotoInfo.photoTitle,
        desc: initPhotoInfo.photoDescription,
        originalFilePathName: initPhotoInfo.albumPath + "/" + initPhotoInfo.photoFileName,
        originalFileName: initPhotoInfo.photoFileName,
        albumName: initPhotoInfo.albumName,
        emitter: e,
        tags: initPhotoInfo.tags || []
      };

  // Lazy initialize.
  if (!config) config = require('./config.js').getCachedConfig();

  getNewName(photoInfo);

  return e;
}

// Generate a static page for the photo and store to output folder.
exports.generatePhotoPage = function generatePhotoPage(pi) {
  if (config.debug) console.log('Generating photo page: ' + JSON.stringify(pi));
  var generatingPage = generatePage('photo.html',
                                    { photo: pi,
                                      page: {
                                        title: pi.title
                                      }
                                    }),
      e = new EventEmitter();

  generatingPage.on('ok', function(page) {
    console.log('Page is generated: ' + (pi.title || "for " + pi.originalFileName));
    if (config.debug) console.log('Page is generated: ' + page);
    fsQueue.writeFile(pi.photoDir + '/index.html', page, 'utf8', function(err) {
      if (err) {
        e.emit('error', err);
      } else {
        e.emit('ok');
      }
    });
  });
  generatingPage.on('error', function(err) {
    e.emit('error', err);
  });

  return e;
}

exports.getPhotoInfos = function getPhotoInfos(photoNames) {
  var res = [];
  photoNames.forEach(function(photoName) {
    var pi = photoInfoMap[photoName];
    if (pi) res.push(pi);
  });
  return res;
}
