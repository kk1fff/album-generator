// Copyright 2012 Patrick Wang <kk1fff@patrickz.net>
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

var fs                  = require('fs'),
    crypto              = require('crypto'),
    EventEmitter        = require('events').EventEmitter;
    mkdirp              = require('mkdirp'),
    ii                  = require('./imagemagick-interface.js'),
    generatePage        = require('./template-interface.js').generatePage;

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

//  1. Create a folder in output dir, with the name is the new photo name.
//  2. Resize the photo into the photo folder.
//  3. Read add additional information (EXIF) and write to the photo folder.
//  4. Generate page for that photo.
function generatePhoto(originalPhoto, title, desc) {
  var e = new EventEmitter();
  var photoDir;
  var photoInfo = {
    title: title,
    desc: desc,
    page: {
      title: title
    }
  };
  var newName = null;

  function generatePhotoPage(pi) {
    var generatingPage = generatePage('photo.html', pi);
    generatingPage.on('ok', function(page) {
      console.log('Page is generated: ' + (pi.title || "for " + originalPhoto));
      if (config.debug)
        console.log('Page is generated: ' + page);
      fs.writeFile(photoDir + '/index.html', page, 'utf8', function(err) {
        if (err) {
          e.emit('error', err);
        } else {
          e.emit('ok', newName);
        }
      });
    });
    generatingPage.on('error', function(err) {
      e.emit('error', err);
    });
  }

  // Resize to specified size.
  function shrink(sizeArray) {
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
      console.log("Shrink " + originalPhoto + " to " + size + "px");
      var ee = ii.shrinkSize(size, originalPhoto, photoDir + "/" + size + ".jpg");
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

  function getExif() {
    var ee = ii.getExif(originalPhoto);
    ee.on('ok', function(exif) {
      if (exif) {
        photoInfo.exif = exif;
      }
      generatePhotoPage(photoInfo);
    });
    ee.on('error', function(err) {
      e.emit('error', err);
    });
  }

  function createPhotoDir() {
    fs.mkdir(photoDir, "755", function(err) {
      if (err) {
        // This photo is already be used in other album. It's ok, we can skip
        // all futher file operations to this file.
        if (err.code == 'EEXIST') {
          e.emit('ok', newName);
          return;
        }

        e.emit('error', err);
        return;
      }

      // Right now we have a folder for the picture, we will create shrunk
      // version and web page and place them into this folder.
      var shrinking = shrink(config.imageSizes);
      shrinking.on('ok', function() {
        getExif();
      });
      shrinking.on('error', function(err) {
        e.emit('error', err);
      });
    });
  };

  var sha1 = crypto.createHash('sha1');
  var stream = fs.createReadStream(originalPhoto);

  // We take title and desc into hash code, so the same photos but with different
  // titles and descs will be different folder.
  if (title) sha1.update(title);
  if (desc) sha1.update(desc);

  stream.on('data', function(d) {
    sha1.update(d);
  });
  stream.on('end', function() {
    newName = "photo-" + sha1.digest('hex');
    photoDir = config.outputDir + '/' + newName;
    createPhotoDir();
  });
  stream.on('error', function(err) {
    e.emit('error', err);
  });

  return e;
}

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

    function onProcessedOnePhoto(success, photo, originalIndex, newName) {
      processingPhoto--;
      if (success) {
        realAlbum.photos[originalIndex] = {
          file: newName,
          title: photo.title,
          desc: photo.desc,
        };
      }
      if (processingPhoto == 0) {
        // Finalize album info.
        realAlbum.title = albumConfig.title || albumPath;
        realAlbum.desc = albumConfig.desc;
        realAlbum.cover = nameMap[albumConfig.cover || 0];
        e.emit('ok', realAlbum);
      }
    }

    albumConfig.photos.forEach(function(photo, i) {
      processingPhoto++;
      var ee = generatePhoto(albumPath + '/' + photo.file, photo.title, photo.desc);
      ee.on('ok', function(newName) {
        nameMap[i] = newName;
        onProcessedOnePhoto(true, photo, i, newName);
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

function getAlbumFileName(albumInfo) {
  return 'album-' + albumInfo.index + '.html';
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
  function generatePhotoListForRendering(list) {
    var listForRendering = [];
    list.forEach(function(p) {
      // The array may be sparse, we just care about real photos.
      if (!p) return;
      listForRendering.push({
        thumbnailUrl: config.httpPrefix + "/" + p.file + "/" + config.thumbnailName,
        pageUrl: config.httpPrefix + "/" + p.file + "/",
        title: p.title,
        desc: p.desc
      });
    });
    return listForRendering;
  };

  var listForRendering = [];
  list.forEach(function(a) {
    listForRendering.push({
      cover: config.httpPrefix + "/" + a.cover + "/" + config.thumbnailName,
      albumUrl: getAlbumUrl(a),
      albumPageName: getAlbumFileName(a),
      photos: generatePhotoListForRendering(a.photos),
      title: a.title || "",
      desc: a.desc
    });
  });

  // Sort listForRendering to make it stable. Sort by title.
  listForRendering.sort(function(a, b) {
    if (a.title > b.title) return 1;
    if (a.title < b.title) return -1;
    return 0;
  });

  return listForRendering;
}

function generateAlbumPage(albumInfo) {
  if (config.debug) {
    console.log("Album Info: " + JSON.stringify(albumInfo));
  }
  var generating = generatePage('album.html', {
        album: albumInfo,
        page: {
           title: albumInfo.title
        }
      }),
      e = new EventEmitter();
  generating.on('ok', function(page) {
    fs.writeFile(config.outputDir + '/' + albumInfo.albumPageName, page, function(err) {
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
      res += ('   - Photo: ' + p.file + '\n');
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
    var ee = generateAlbumPage(a);
    ee.on('ok', function() {
      onAlbumPageGenerated();
    });
    ee.on('error', function(err) {
      e.emit('error', err);
      onAlbumPageGenerated();
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
        album.index = i;
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
