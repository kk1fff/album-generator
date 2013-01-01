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

var crypto        = require('crypto'),
    EventEmitter  = require('events').EventEmitter,
    mkdirp        = require('mkdirp'),
    ii            = require('./imagemagick-interface.js'),
    generatePage  = require('./template-interface.js').generatePage,
    config        = null;

//  1. Create a folder in output dir, with the name is the new photo name.
//  2. Resize the photo into the photo folder.
//  3. Read add additional information (EXIF) and write to the photo folder.
//  4. Generate page for that photo.
function generatePhotoPage(pi) {
  var generatingPage = generatePage('photo.html', pi);
  generatingPage.on('ok', function(page) {
    console.log('Page is generated: ' + (pi.title || "for " + pi.originalFileName));
    if (config.debug)
      console.log('Page is generated: ' + page);
    fs.writeFile(pi.photoDir + '/index.html', page, 'utf8', function(err) {
      if (err) {
        pi.e.emit('error', err);
      } else {
        pi.e.emit('ok', pi.newName);
      }
    });
  });
  generatingPage.on('error', function(err) {
    pi.e.emit('error', err);
  });
}

// Resize to specified size.
function shrink(sizeArray, pi) {
  var waitingShrinking = 0;
  var e = new EventEmitter();
  function onShrunk() {
    waitingShrinking--;
    if (waitingShrinking == 0) {
      e.emit('ok');
    }
  }
  sizeArray.forEach(function (size) {
    waitingShrinking++;
    console.log("Shrink " + pi.originalPhoto + " to " + size + "px");
    var ee = ii.shrinkSize(size, pi.originalPhoto, pi.photoDir + "/" + size + ".jpg");
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

function getExif(pi) {
  var ee = ii.getExif(pi.originalPhoto);
  ee.on('ok', function(exif) {
    if (exif) {
      pi.exif = exif;
    }
    generatePhotoPage(pi);
  });
  ee.on('error', function(err) {
    pi.e.emit('error', err);
  });
}

function createPhotoDir(pi) {
  fs.mkdir(pi.photoDir, "755", function(err) {
    if (err) {
      // This photo is already be used in other album. It's ok, we can skip
      // all futher file operations to this file.
      if (err.code == 'EEXIST') {
        pi.e.emit('ok', pi.newName);
        return;
      }

      pi.e.emit('error', err);
      return;
    }

    // Right now we have a folder for the picture, we will create shrunk
    // version and web page and place them into this folder.
    var shrinking = shrink(config.imageSizes, pi);
    shrinking.on('ok', function() {
      getExif(pi);
    });
    shrinking.on('error', function(err) {
      pi.e.emit('error', err);
    });
  });
};

exports.processPhoto = function processPhoto(albumPath, photoFileName, title, desc) {
  var e = new EventEmitter(),
      originalPhoto = albumPath + "/" + photoFileName,
      photoInfo = {
        title: title,
        desc: desc,
        originalPhoto: originalPhoto,
        originalFileName: photoFileName,
        e: e,
        page: {
          title: title
        }
      },
      sha1 = crypto.createHash('sha1'),
      stream = fs.createReadStream(originalPhoto);

  // Lazy initialize.
  if (!config) {
    config = require('./config.js').getCachedConfig();
  }

  // We take title and desc into hash code, so the same photos but with different
  // titles and descs will be different folder.
  if (title) sha1.update(title);
  if (desc) sha1.update(desc);

  stream.on('data', function(d) {
    sha1.update(d);
  });
  stream.on('end', function() {
    photoInfo.newName = "photo-" + sha1.digest('hex');
    photoInfo.photoDir = config.outputDir + '/' + photoInfo.newName;
    createPhotoDir(photoInfo);
  });
  stream.on('error', function(err) {
    e.emit('error', err);
  });

  return e;
}
