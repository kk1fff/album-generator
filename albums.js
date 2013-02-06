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
var EventEmitter   = require('events').EventEmitter,
    fs             = require('fs'),
    fsQueue        = require('./fs-sync.js'),
    fileOperator   = require('./file-operator.js'),
    template       = require('./template-interface.js'),
    PhotoProcessor = require('./photoprocessor.js'),
    config         = require('./config.js').getConfig(),
    tagging        = require('./tagging.js');

function processAlbum(albumPath) {
  var realAlbum = {};
  var e = new EventEmitter();

  function loadAlbum(albumConfig, cachedConfig) {
    // Process photos:
    //  1. Generate new file name of the photo, "photo-" and the sha1 hash of
    //     original photo file plus title and desc.
    //  2. Record the new name and original description into realAlbum.photos.
    //  3. After all photos are processed, emit 'ok' event with the processed
    //     album info.
    //  4. Record the processed info for cache.
    realAlbum.photos = [];
    var processingPhoto = 0;
    var photoMap = [];

    if (!cachedConfig) {
      cachedConfig = {
        hash: {},
        rawExif: {}
      };
    }

    function onProcessedOnePhoto(success, photo, originalIndex, photoInfo) {
      processingPhoto--;
      if (success) {
        cachedConfig.hash[photo.file] = photoInfo.getHash(); // Record processed photo.
        cachedConfig.rawExif[photo.file] = photoInfo.getRawExif();
        photoInfo.inputFileName = photo.file;
        realAlbum.photos[originalIndex] = photoInfo;
      }
      if (processingPhoto == 0) {
        // Finalize album info.
        realAlbum.title = albumConfig.title || albumPath;
        realAlbum.desc = albumConfig.desc;
        realAlbum.cover = photoMap[albumConfig.cover || 0];
        realAlbum.name = albumConfig.name;
        realAlbum.sortcode = albumConfig.sortcode || -1;
        // Store cached
        fs.writeFileSync(albumPath + '/' + config.albumCachedFileName,  JSON.stringify(cachedConfig), 'utf8');
        e.emit('ok', realAlbum);
      }
    }

    albumConfig.photos.forEach(function(photo, i) {
      processingPhoto++;

      // Use file name as title of photo if the title is not specified.
      photo.title = photo.title || photo.file;

      var pprocessor = new PhotoProcessor.Photo({
        sourcePath:       albumPath,
        albumName:        getAlbumName(albumConfig),
        photoFileName:    photo.file,
        photoTitle:       photo.title,
        tags:             (photo.tags || []).concat(albumConfig.tags || []),
        photoDescription: photo.desc,
        cachedHash:       cachedConfig.hash[photo.file],
        cachedRawExif:    cachedConfig.rawExif[photo.file]
      });
      var ee = pprocessor.processPhotoPage();
      ee.on('ok', function(photoInfo) {
        photoMap[i] = photoInfo;
        onProcessedOnePhoto(true, photo, i, photoInfo);
      });
      ee.on('error', function(err) {
        console.error("Error when processing photo " + albumPath + '/' + photo.file + ": " + err);
        onProcessedOnePhoto(false);
      });
    });
  }

  var albumJsonData, albumCachedJson;
  try {
    albumJsonData = fs.readFileSync(albumPath + '/' + config.albumFileName, 'utf8');
  } catch (err) {
    e.emit('error', err);
  }

  try {
    albumCachedJson = fs.readFileSync(albumPath + '/' + config.albumCachedFileName, 'utf8');
  } catch (err) {
    // Throw away...
  }
  loadAlbum(JSON.parse(albumJsonData),
            albumCachedJson ? JSON.parse(albumCachedJson) : null);

  return e;
};

function getAlbumName(albumInfo) {
  return albumInfo.name;
}

function getAlbumFileName(albumInfo) {
  return getAlbumName(albumInfo) + '.html';
}

function getAlbumUrl(albumInfo) {
  return config.httpPrefix + "/" + getAlbumFileName(albumInfo);
}

function getAlbumListFileNameByOffset(offset, limit) {
  if (offset < 0) return null;
  if (limit && offset >= limit) return null;
  if (offset == 0) return 'index.html';
  return "albumlist-" + Math.floor(offset / config.albumsPerPage) + ".html";
}

function makeAlbumListPageUrl(filename) {
  if (!filename) return null;
  return config.httpPrefix + "/" + filename;
}

function generateAlbumListSinglePage(albumList, tags, offset, emitter) {
  if (config.debug) console.log("Generate single page: " + offset + ", length: " + albumList.length + ", next: " + makeAlbumListPageUrl(getAlbumListFileNameByOffset(offset + config.albumsPerPage, albumList.length)));
  var generating = template.generatePageAndStoreTo(
    'album-list.html',
    config.outputDir + "/" + getAlbumListFileNameByOffset(offset),
    {
      albums: albumList,
      info: {
        albumList: albumList.slice(offset, offset + config.albumsPerPage),
        prevUrl: makeAlbumListPageUrl(getAlbumListFileNameByOffset(offset - config.albumsPerPage)),
        nextUrl: makeAlbumListPageUrl(getAlbumListFileNameByOffset(offset + config.albumsPerPage, albumList.length))
      },
      tags: tags,
      page: {
        title: "Album List",
        enableTagListOnSidebar: true
      }
    });
  generating.on('ok', function(page) {
    if ((offset + config.albumsPerPage) < albumList.length) {
      generateAlbumListSinglePage(albumList, tags, offset + config.albumsPerPage, emitter);
    } else {
      emitter.emit('ok');
    }
  });
  generating.on('error', function(e) {
    emitter.emit('error', e);
  });  
}

function generateAlbumListPage(albumList, tags) {
  var e = new EventEmitter();
  generateAlbumListSinglePage(albumList, tags, 0, e);
  return e;
}

function generateAlbumListForRendering(list) {
  function generatePhotoListForRendering(photos, containingAlbum) {
    var result = [];
    photos.forEach(function(p) {
      // The array may be sparse, we just care about real photos.
      if (!p) return;
      result.push(p);
    });

    // Build url for prev/next photo.
    result.forEach(function(p, i) {
      var next = i + 1;
      var prev = i - 1;
      if (next >= result.length) next = 0;
      if (prev < 0) prev = result.length - 1;
      p.setPrevUrl(result[prev].pageUrl());
      p.setNextUrl(result[next].pageUrl());
      p.setAlbumTitle(containingAlbum.title || "No title");
      p.setAlbumUrl(getAlbumUrl(containingAlbum));
    });

    return result;
  };

  var listForRendering = [];
  list.forEach(function(a) {
    listForRendering.push({
      thumbnailUrl: a.cover.thumbnailUrl(),
      littleThumbnailUrl: a.cover.littleThumbnailUrl(),
      albumUrl: getAlbumUrl(a),
      albumPageName: getAlbumFileName(a),
      photos: generatePhotoListForRendering(a.photos, a),
      title: a.title || "No title",
      sortcode: a.sortcode,
      desc: a.desc
    });
  });

  // Sort listForRendering to make it stable. Sort by title.
  listForRendering.sort(function(a, b) {
    if (a.sortcode < b.sortcode) return 1;
    if (a.sortcode > b.sortcode) return -1;
    return 0;
  });

  return listForRendering;
}

function generateAlbumPage(albumList, albumInfo, tags) {
  if (config.debug) {
    console.log("Album Info: " + JSON.stringify(albumInfo));
  }
  var generating = template.generatePage('album.html', {
        album: albumInfo,
        albums: albumList,
        tags: tags,
        page: {
          title: albumInfo.title,
          desc: albumInfo.desc,
          enableAlbumListOnSidebar: true,
          enableTagListOnSidebar: true,
          titleImage: albumInfo.thumbnailUrl
        }
      }),
      e = new EventEmitter();
  generating.on('ok', function(page) {
    fsQueue.writeFile(config.outputDir + '/' + albumInfo.albumPageName, page, function(err) {
      if (err) {
        e.emit('error', err);
      } else {
        e.emit('ok');
      }
    });
  });
  generating.on('error', function(e) {
    e.emit('error', err);
  });

  return e;
}

function formatAlbumListForLog(albumList) {
  var res = '';

  if (config.debug) {
    console.log("Try formatting: " + JSON.stringify(albumList));
  }

  function formatPhoto(photos) {
    var res = '';
    photos.forEach(function(p) {
      res += ('   - Photo: ' + p.inputFileName + '\n');
    });
    return res;
  }

  albumList.forEach(function(a) {
    res += ('- Album: ' + a.title + '\n');
    res += (' description: ' + (a.desc || "") + '\n');
    res += (' photo: \n' + formatPhoto(a.photos));
  });

  return res;
};

function generatePages(albumList) {
  console.log("Generating album list:\n" + formatAlbumListForLog(albumList));
  var list = generateAlbumListForRendering(albumList),
      e = new EventEmitter(),
      generating = 0,
      tags = tagging.getTags(),
      generatingAlbumList = generateAlbumListPage(list, tags),
      generatingTagPage = tagging.generateTagPages(list);

  function onAlbumPageGenerated() {
    generating--;
    if (generating == 0) {
      e.emit('ok');
    }
  }

  // Album List page.
  generating++;
  generatingAlbumList.on('ok', function() {
    onAlbumPageGenerated();
  });
  generatingAlbumList.on('error', function(err) {
    e.emit('error', err);
    onAlbumPageGenerated();
  });

  // Tag pages.
  generating++;
  generatingTagPage.on('ok', function() {
    onAlbumPageGenerated();
  });
  generatingTagPage.on('error', function(err) {
    e.emit('error', err);
    onAlbumPageGenerated();
  });  

  // Album and photo pages.
  list.forEach(function(a) {
    generating++;
    var ee = generateAlbumPage(list, a, tags),
        generatingSingleAlbum = 1;

    function onSingleAlbumGenerated() {
      generatingSingleAlbum--;
      if (generatingSingleAlbum == 0) {
        onAlbumPageGenerated();
      }
    }

    a.photos.forEach(function(p) {
      var ee = p.generatePage(list);
      ee.on('ok', function() {
        onSingleAlbumGenerated();
      });
      ee.on('error', function(err) {
        e.emit('error', err);
        onSingleAlbumGenerated();
      });
    });

    ee.on('ok', function() {
      onSingleAlbumGenerated();
    });
    ee.on('error', function(err) {
      e.emit('error', err);
      onSingleAlbumGenerated();
    });
  });
  
  return e;
}

exports.processAlbums = function processAlbums() {
  var ee;
  ee = fileOperator.fetchAlbumPath(true);
  ee.on('ok', function(list) {
    console.log("Source album:\n" + list.join('\n'));
    var albumList = [];
    var pendingAlbum = 0;

    function onProcessedOneAlbum() {
      pendingAlbum--;
      if (pendingAlbum == 0) {
        var ee = generatePages(albumList);
        ee.on('ok', function() {
          console.log("done");
        });
      }
    }

    list.forEach(function(p, i) {
      pendingAlbum++;
      var ee = processAlbum(p);
      ee.on('ok', function(album) {
        albumList.push(album);
        onProcessedOneAlbum();
      });
      ee.on('error', function(err) {
        console.log("Error in processing album: " + err);
        onProcessedOneAlbum();
      });
    });
  });
}

