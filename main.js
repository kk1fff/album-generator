var fs = require('fs'),
    crypto = require('crypto'),
    mkdirp = require('mkdirp'),
    _ = require('underscore'),
    ii = require('./imagemagick-interface.js');
var EventEmitter = require('events').EventEmitter;
var inputDir = __dirname + '/input';
var outputDir = __dirname + '/output';
var templateDir = __dirname + '/templates';
var albumFileName = 'album.json';
var imageSizes = [2000, 1000];
var errorLog = [];

// Load all subdirectories from inputDir.
function fetchAlbumPath() {
  var e = new EventEmitter();

  fs.readdir(inputDir, function(err, files) {
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
      var filePath = inputDir + '/' + file;
      waitingStat++;
      fs.lstat(filePath, function(err, stat) {
        if (err || !stat.isDirectory()) {
          onGotFileStat();
          return;
        }

        // If the path is a directory, we will need to check if there's a
        // configure file in it.
        fs.lstat(filePath + '/' + albumFileName, function(err, stat) {
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

var cachedTemplate = {};
function generatePage(templateName, data) {
  var e = new EventEmitter();
  var cached = cachedTemplate[templateName];
  if (cached) {
    setTimeout(e.emit.bind(e, 'ok', cached(data)), 0);
  } else {
    fs.readFile(templateDir + "/" + templateName, 'utf8', function(err, d) {
      if (err) {
        e.emit('error', err);
        return;
      }
      cached = _.template(d);
      cachedTemplate[templateName] = cached;
      e.emit('ok', cached(data));
    });
  }
  return e;
}

//  1. Create a folder in output dir, with the name is the new photo name.
//  2. Resize the photo into the photo folder.
//  3. Read add additional information (EXIF) and write to the photo folder.
//  4. Generate page for that photo.
function generatePhoto(originalPhoto, title, desc) {
  var e = new EventEmitter();
  var photoDir;
  var photoInfo = {
    title: title,
    desc: desc
  };
  var newName = null;

  function generatePhotoPage(pi) {
    var generatingPage = generatePage('photo.html', pi);
    generatingPage.on('ok', function(page) {
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
      var shrinking = shrink(imageSizes);
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
    photoDir = outputDir + '/' + newName;
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

    function onProcessedOnePhoto(success, photo, newName) {
      processingPhoto--;
      if (success) {
        realAlbum.photos.push({
          file: newName,
          title: photo.title,
          desc: photo.desc,
        });
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
        onProcessedOnePhoto(true, photo, newName);
      });
      ee.on('error', function(err) {
        console.error("Error when processing photo " + albumPath + '/' + photo.file + ": " + err);
        onProcessedOnePhoto(false);
      });
    });
  }

  fs.readFile(albumPath + '/' + albumFileName, 'utf8', function(err, data) {
    if (err) {
      e.emit('error', err);
      return;
    }
    loadAlbum(JSON.parse(data));
  });

  return e;
};

function generateAlbumListPage(albumList) {

}

function generateAlbumPage(albumList) {
  console.log("Album list: " + JSON.stringify(albumList));
  generateAlbumListPage(albumList);
}

function run() {
  var ee = fetchAlbumPath();
  mkdirp.sync(outputDir);

  ee.on('ok', function(list) {
    console.log("File list: " + JSON.stringify(list));
    var albumList = [];
    var pendingAlbum = 0;

    function onProcessedOneAlbum() {
      pendingAlbum--;
      if (pendingAlbum == 0) {
        generateAlbumPage(albumList);
      }
    }

    list.forEach(function(p) {
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

run();
