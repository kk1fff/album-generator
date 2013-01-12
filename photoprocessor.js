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
    util          = require('./util.js'),
    config        = null,
    newNameQueue       = [],
    runningNewNameTask = 0,
    newNameTaskLimit   = 5,
    photoInfoMap  = {}; // Name to info map.

// Constants
var STATE_ERROR            = 0;
var STATE_AVAILABLE        = 1;
var STATE_GETTING_NEW_NAME = 2;
var STATE_CREATING_DIR     = 3;
var STATE_SHRINKING_IMAGE  = 4;
var STATE_GETTING_EXIF     = 5;
var STATE_PROCSSING_PHOTO  = 6;

var RESULT_OK                 = 0;
var RESULT_ERROR              = 1;
var RESULT_FILE_READY         = 2;
var RESULT_PROCESS_PHOTO      = 3;
var RESULT_PROCESS_PHOTO_PAGE = 4;

function Photo(sourcePath, sourcePhoto) {
  this.sourcePhotoPathName = sourcePath + "/" + sourcePhoto;
  this.sourcePhoto = sourcePhoto;
  this.state = STATE_AVAILABLE;
}

Photo.prototype = {
  _doShrink: function _doShrink() {
    var waitingShrinking = 0,
        self = this;
    function onShrunk(imageConfig) {
      waitingShrinking--;

      if (imageConfig) {
        console.log("Produced image " + imageConfig.filename + " for " + self.sourcePhoto);
      }

      if (waitingShrinking == 0) {
        self.onOperationDone(RESULT_OK);
      }
    }

    config.images.forEach(function (imageConfig) {
      waitingShrinking++;
      var ee = ii.processImage(self.sourcePhotoPathName,
                               self.photoDir + "/" + imageConfig.filename,
                               imageConfig.sizeLimit,
                               imageConfig.thumbnail,
                               imageConfig.square);
      ee.on('ok', function() {
        onShrunk(imageConfig);
      });
      ee.on('error', function(err) {
        console.error(err);
        self.handleError(err);
        onShrunk();
      });
    });
  },

  _doCreatePhotoDir: function _doCreatePhotoDir() {
    var self = this;
    fs.mkdir(this.photoDir, "755", function(err) {
      if (err) {
        // This photo is already be used in other album. It's ok, we can skip
        // all futher file operations to this file and jump to exif directly.
        if (err.code == 'EEXIST') {
          self.onOperationDone(RESULT_FILE_READY);
        } else {
          self.onOperationDone(RESULT_ERROR, err);
        }
        return;
      }

      // Put an index.html to prevent accessing dir list
      fs.writeFileSync(self.photoDir + "/index.html", " ", "utf8");

      // Right now we have a folder for the picture
      self.onOperationDone(RESULT_OK);
    });
  },

  _doGetNewName: function _doGetNewName() {
    var self = this,
        sha1 = crypto.createHash('sha1'),
        gettingHash;

    gettingHash = fsQueue.getHash(sha1, this.sourcePhotoPathName);
    gettingHash.on('ok', function(hash) {
      self.hash = hash.digest('hex');
      self.name = "photo-" + self.hash;
      self.photoDir = config.outputDir + '/' + self.name;
      self.onOperationDone(RESULT_OK);
    });

    gettingHash.on('error', function(err) {
      self.onOperationDone(RESULT_ERROR, err);
    });
  },

  _doGetExif: function _doGetExif() {
    var self = this,
        ee = ei.getExif(this.sourcePhotoPathName);
    ee.on('ok', function(exif, tags) {
      self.exif = exif;
      self.tags = tags;
      self.onOperationDone(RESULT_OK);
    });

    ee.on('error', function(err) {
      self.onOperationDone(RESULT_ERROR, err);
    });
  },

  processPhoto: function processPhoto() {
    this.emitter = new EventEmitter();
    this.onOperationDone(RESULT_PROCESS_PHOTO);
    return this.emitter;
  },

  onOperationDone: function(result, err) {
    switch (this.state) {
    case STATE_AVAILABLE:
      if (result == RESULT_PROCESS_PHOTO) {
        this.state = STATE_GETTING_NEW_NAME;
        setTimeout(this._doGetNewName.bind(this), 0);
      }
      break;
    case STATE_GETTING_NEW_NAME:
      if (result === RESULT_OK) {
        this.state = STATE_CREATING_DIR;
        setTimeout(this._doCreatePhotoDir.bind(this), 0);
      } else {
        this.state = STATE_ERROR;
        setTimeout(this.handleError.bind(this, err), 0);
      }
      break;
    case STATE_CREATING_DIR:
      if (result === RESULT_OK) {
        // Shrink image
        this.state = STATE_SHRINKING_IMAGE;
        setTimeout(this._doShrink.bind(this), 0);
      } else if (result === RESULT_FILE_READY) {
        // File is already there. Just get EXIF.
        this.state = STATE_GETTING_EXIF;
        setTimeout(this._doGetExif.bind(this), 0);
      } else {
        this.state = STATE_ERROR;
        setTimeout(this.handleError.bind(this, err), 0);
      }
      break;
    case STATE_SHRINKING_IMAGE:
      if (result === RESULT_OK) {
        this.state = STATE_GETTING_EXIF;
        setTimeout(this._doGetExif.bind(this), 0);
      } else {
        this.state = STATE_ERROR;
        setTimeout(this.handleError.bind(this, err), 0);
      }
      break;
    case STATE_GETTING_EXIF:
      if (result === RESULT_OK) {
        this.state = STATE_AVAILABLE;
        setTimeout(this.handleSuccess.bind(this), 0);
      }
      break;

    }
  },

  handleError: function handleError(err) {
    this.emitter.emit('error', err);
  },

  handleSuccess: function handleSuccess() {
    this.emitter.emit('ok', this);
  }
};

function PhotoPage(photoInfo) {
  this.title = photoInfo.photoTitle;
  this.desc = photoInfo.photoDescription;
  this.sourcePath = photoInfo.sourcePath;
  this.originalFilePathName = photoInfo.sourcePath + "/" + photoInfo.photoFileName;
  this.originalFileName = photoInfo.photoFileName;
  this.albumName = photoInfo.albumName;
  this.tags = photoInfo.tags || []
  this.state = STATE_AVAILABLE;
}

PhotoPage.prototype = {
  name: function name() {
    if (!this._photoHash) return null;
    return "photopage-" + this.albumName + "-" + 
      util.getSafeName(this.originalFileName) + "-" + this._photoHash;
  },

  pageUrl: function pageUrl() {
    if (!this.name()) return null;
    return config.httpPrefix + "/" + this.name() + ".html";
  },

  thumbnailUrl: function thumbnailUrl() {
    if (!this._photoHash) return null;
    return config.httpPrefix + "/" + this._photoName + "/" + config.photoThumbnailName;
  },

  littleThumbnailUrl: function littleThumbnailUrl() {
    if (!this._photoName) return null;
    return config.httpPrefix + "/" + this._photoName + "/" + config.littleThumbnailName;
  },

  photoImageUrl: function photoImageUrl() {
    if (!this._photoName) return null;
    return config.httpPrefix + "/" + this._photoName + "/" + config.photoName;
  },

  _doProcessPhoto: function _doProcessPhoto() {
    var photo = new Photo(this.sourcePath, this.originalFileName),
        ee = photo.processPhoto(),
        self = this;
    ee.on('ok', function() {
      // Photo is generated, copy photo's file information.
      self._photoName = photo.name;
      self._photoHash = photo.hash;
      self.exif = photo.exif;
      self.tags = self.tags.concat(photo.tags);
      self.onOperationDone(RESULT_OK);
    });

    ee.on('error', function(err) {
      self.onOperationDone(RESULT_ERROR, err);
    });
  },

  _addTagsOfPhoto: function _addTagsOfPhoto() {
    var self = this;
    this.tags.forEach(function(tag) {
      tagging.addTag(self.name(), tag);
    });
  },

  // This function expects an input:
  // {
  //   sourcePath: input path of album.
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
  processPhotoPage: function processPhotoPage() {
    this.emitter = new EventEmitter();

    // Lazy initialize.
    if (!config) config = require('./config.js').getCachedConfig();
    this.onOperationDone(RESULT_PROCESS_PHOTO_PAGE);

    return this.emitter;
  },

  onOperationDone: function onOperationDone(result, err) {
    switch (this.state) {
    case STATE_AVAILABLE:
      if (result === RESULT_PROCESS_PHOTO_PAGE) {
        this.state = STATE_PROCSSING_PHOTO;
        setTimeout(this._doProcessPhoto.bind(this), 0);
      }
      break;
    case STATE_PROCSSING_PHOTO:
      if (result === RESULT_OK) {
        this.handleSuccess();
      }
    }
  },

  handleError: function handleError(err) {
    this.emitter.emit('error', err);
  },

  handleSuccess: function handleSuccess() {
    this._addTagsOfPhoto();
    photoInfoMap[this.name()] = this;
    this.emitter.emit('ok', this);
  }
};

// Generate a static page for the photo and store to output folder.
exports.generatePhotoPage = function generatePhotoPage(pi, albums) {
  if (config.debug) console.log('Generating photo page: ' + JSON.stringify(pi));
  var generatingPage = generatePage('photo.html',
                                    { photo: pi,
                                      tags: tagging.getSimpleProperties(pi.tags),
                                      albums: albums,
                                      page: {
                                        title: pi.title,
                                        desc: pi.desc,
                                        enableTagListOnSidebar: true,
                                        enableAlbumListOnSidebar: true
                                      }
                                    }),
      e = new EventEmitter();

  generatingPage.on('ok', function(page) {
    console.log('Page is generated: ' + (pi.title || "for " + pi.originalFileName));
    if (config.debug) console.log('Page is generated: ' + page);
    fsQueue.writeFile(config.outputDir + "/" + pi.name() + '.html', page, 'utf8', function(err) {
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

exports.getPhotoInfo = function(photoName) {
  return photoInfoMap[photoName];
}

exports.getPhotoInfos = function getPhotoInfos(photoNames) {
  var res = [];
  photoNames.forEach(function(photoName) {
    var pi = photoInfoMap[photoName];
    if (pi) res.push(pi);
  });
  return res;
}

exports.Photo = PhotoPage;
