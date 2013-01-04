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
    EventEmitter = require('events').EventEmitter;
    mkdirp       = require('mkdirp'),
    generatePage = require('./template-interface.js').generatePage,
    pp           = require('./photoprocessor.js'),
    fsQueue      = require('./fs-queue.js');

// Error Log
var errorLog = [];
var config = null;

// Load all subdirectories from inputDir.
function fetchAlbumPath() {
  var e = new EventEmitter();

  fs.readdir(config.inputDir, function(err, files) {
    if (err) {
      e.emit('error', err);
      return;
    }

    var waitingStat = 0, dirList = [];

    // Handle getting file stat, whenever it is success or not.
    function onGotFileStat() {
      waitingStat--;
      if (waitingStat == 0) {
        e.emit('ok', dirList);
      }
    };

    files.forEach(function(file) {
      var filePath = config.inputDir + '/' + file;
      waitingStat++;
      fs.lstat(filePath, function(err, stat) {
        if (err || !stat.isDirectory()) {
          onGotFileStat();
          return;
        }

        // If the path is a directory, we will need to check if there's a
        // configure file in it.
        fs.lstat(filePath + '/' + config.albumFileName, function(err, stat) {
          if (stat && stat.isFile()) {
            dirList.push(filePath);
          }
          onGotFileStat();
        });
      });
    });
  });

  return e;
};

function generateAlbum(albumPath) {
  var realAlbum = {};
  var e = new EventEmitter();

  function loadAlbum(albumConfig) {
    // Process photos:
    //  1. Generate new file name of the photo, "photo-" and the sha1 hash of
    //     original photo file plus title and desc.
    //  2. Record the new name and original description into realAlbum.photos.
    //  3. After all photos are processed, emit 'ok' event with the processed
    //     album info.
    realAlbum.photos = [];
    var processingPhoto = 0;
    var nameMap = [];

    function onProcessedOnePhoto(success, photo, originalIndex, photoInfo) {
      processingPhoto--;
      if (success) {
        photoInfo.inputFileName = photo.file;
        realAlbum.photos[originalIndex] = photoInfo;
      }
      if (processingPhoto == 0) {
        // Finalize album info.
        realAlbum.title = albumConfig.title || albumPath;
        realAlbum.desc = albumConfig.desc;
        realAlbum.cover = nameMap[albumConfig.cover || 0];
        realAlbum.name = albumConfig.name;
        realAlbum.sortcode = albumConfig.sortcode || -1;
        e.emit('ok', realAlbum);
      }
    }

    albumConfig.photos.forEach(function(photo, i) {
      processingPhoto++;

      // Use file name as title of photo if the title is not specified.
      photo.title = photo.title || photo.file;

      var ee = pp.processPhoto({
        albumPath:        albumPath,
        albumName:        getAlbumName(albumConfig),
        photoFileName:    photo.file,
        photoTitle:       photo.title,
        photoDescription: photo.desc
      });
      ee.on('ok', function(photoInfo) {
        nameMap[i] = photoInfo.name;
        onProcessedOnePhoto(true, photo, i, photoInfo);
      });
      ee.on('error', function(err) {
        console.error("Error when processing photo " + albumPath + '/' + photo.file + ": " + err);
        onProcessedOnePhoto(false);
      });
    });
  }

  fs.readFile(albumPath + '/' + config.albumFileName, 'utf8', function(err, data) {
    if (err) {
      e.emit('error', err);
      return;
    }
    loadAlbum(JSON.parse(data));
  });

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

function generateAlbumListPage(albumList) {
  var e = new EventEmitter();

  var generating = generatePage('album-list.html', {
    albums: albumList,
    page: {
      title: "Album List"
    }
  });
  generating.on('ok', function(page) {
    fs.writeFile(config.outputDir + '/index.html', page, function(err) {
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
      p.prevUrl = config.httpPrefix + "/" + result[prev].name;
      p.nextUrl = config.httpPrefix + "/" + result[next].name;
      p.albumTitle = containingAlbum.title || "No title";
      p.albumUrl = getAlbumUrl(containingAlbum);
      p.thumbnailUrl = config.httpPrefix + "/" + p.name + "/" + config.thumbnailName;
      p.littleThumbnailUrl = config.httpPrefix + "/" + p.name + "/" + config.littleThumbnailName;
      p.pageUrl = config.httpPrefix + "/" + p.name + "/";
    });

    return result;
  };

  var listForRendering = [];
  list.forEach(function(a) {
    listForRendering.push({
      thumbnailUrl: config.httpPrefix + "/" + a.cover + "/" + config.thumbnailName,
      littleThumbnailUrl: config.httpPrefix + "/" + a.cover + "/" + config.littleThumbnailName,
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

function generateAlbumPage(albumList, albumInfo) {
  if (config.debug) {
    console.log("Album Info: " + JSON.stringify(albumInfo));
  }
  var generating = generatePage('album.html', {
        album: albumInfo,
        albums: albumList,
        page: {
           title: albumInfo.title
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

function generateAlbumPages(albumList) {
  console.log("Generating album list:\n" + formatAlbumListForLog(albumList));
  var list = generateAlbumListForRendering(albumList),
      e = new EventEmitter(),
      generating = 0,
      generatingAlbumList = generateAlbumListPage(list);

  function onAlbumPageGenerated() {
    generating--;
    if (generating == 0) {
      e.emit('ok');
    }
  }

  generating++;
  generatingAlbumList.on('ok', function() {
    onAlbumPageGenerated();
  });
  generatingAlbumList.on('error', function(err) {
    e.emit('error', err);
    onAlbumPageGenerated();
  });

  list.forEach(function(a) {
    generating++;
    var ee = generateAlbumPage(list, a),
        generatingSingleAlbum = 1

    function onSingleAlbumGenerated() {
      generatingSingleAlbum--;
      if (generatingSingleAlbum == 0) {
        onAlbumPageGenerated();
      }
    }

    a.photos.forEach(function(p) {
      var ee = pp.generatePhotoPage(p);
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

function deployCss() {
  var e = new EventEmitter(),
      deployingFile = 0;

  function onDeployedOneFile() {
    deployingFile--;
    if (deployingFile == 0) {
      e.emit('ok');
    }
  }

  mkdirp.sync(config.outputDir + '/css');

  fs.readdir(config.cssSourceDir, function(err, csses) {
    if (err) {
      e.emit('error', err);
    } else {
      // 1. Read css sourece dir for all css file.
      // 2. For each entry, test if it is a regular file. If so, we assume it is a css file.
      // 3. For each file, read its content.
      // 4. Write its content into output directory.
      csses.forEach(function(cssFile) {
        deployingFile++;
        var file = config.cssSourceDir + "/" + cssFile;
        fs.lstat(file, function(err, stat) {
          if (stat.isFile()) {
            fs.readFile(file, 'utf8', function(err, data) {
              fs.writeFile(config.outputDir + "/css/" + cssFile, data, function(err) {
                if (err) {
                  e.emit('error', err);
                  onDeployedOneFile();
                } else {
                  onDeployedOneFile();
                }
              });
            });
          }
        });
      });
    }
  });

  return e;
}

function deployJs() {
  var e = new EventEmitter(),
      deployingFile = 0;

  function onDeployedOneFile() {
    deployingFile--;
    if (deployingFile == 0) {
      e.emit('ok');
    }
  }

  mkdirp.sync(config.outputDir + '/js');

  fs.readdir(config.jsSourceDir, function(err, jses) {
    if (err) {
      e.emit('error', err);
    } else {
      // 1. Read css sourece dir for all js file.
      // 2. For each entry, test if it is a regular file. If so, we assume it is a js file.
      // 3. For each file, read its content.
      // 4. Write its content into output directory.
      jses.forEach(function(jsFile) {
        deployingFile++;
        var file = config.jsSourceDir + "/" + jsFile;
        fs.lstat(file, function(err, stat) {
          if (stat.isFile()) {
            fs.readFile(file, 'utf8', function(err, data) {
              fs.writeFile(config.outputDir + "/js/" + jsFile, data, function(err) {
                if (err) {
                  e.emit('error', err);
                  onDeployedOneFile();
                } else {
                  onDeployedOneFile();
                }
              });
            });
          }
        });
      });
    }
  });

  return e;
}

function prepareDirectory() {
  var e = new EventEmitter();

  function toDeployJs() {
    var ee = deployJs();
    ee.on('ok', function() {
      e.emit('ok');
    });

    ee.on('error', function(err) {
      e.emit('error', err);
    });
  }

  function toDeployCss() {
    var ee = deployCss();
    ee.on('ok', function() {
      toDeployJs();
    });

    ee.on('error', function(err) {
      e.emit('error', err);
    });
  }

  mkdirp(config.outputDir, function(err) {
    if (err) {
      e.emit('error', err);
    } else {
      toDeployCss();
    }
  });

  return e;
}

function processAlbums() {
  var ee;
  ee = fetchAlbumPath();
  ee.on('ok', function(list) {
    console.log("Source album:\n" + list.join('\n'));
    var albumList = [];
    var pendingAlbum = 0;

    function onProcessedOneAlbum() {
      pendingAlbum--;
      if (pendingAlbum == 0) {
        var ee = generateAlbumPages(albumList);
        ee.on('ok', function() {
          console.log("done");
        });
      }
    }

    list.forEach(function(p, i) {
      pendingAlbum++;
      var ee = generateAlbum(p);
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

function run() {
  var ee = prepareDirectory();
  ee.on('ok', function() {
    processAlbums();
  });
  ee.on('error', function(err) {
    console.log('Error when preparing environment: ' + err);
  });
}

var loadingConfig = require('./config.js').load();

loadingConfig.on('ok', function(conf) {
  config = conf;
  run();
});

loadingConfig.on('error', function(err) {
  console.error('Fail to load configure: ' + err);
});
