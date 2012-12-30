var EventEmitter = require('events').EventEmitter;
    fs           = require('fs'),
    cachedConfig = null;

function modifyConfig(data) {
  return {
    inputDir: __dirname + data.inputDir,
    outputDir: __dirname + data.outputDir,
    templateDir: __dirname + data.templateDir,
    albumFileName: data.albumFileName,
    httpPrefix: data.httpPrefix,
    thumbnailName: data.thumbnailName,
    imageSizes: data.imageSizes
  }
};

exports.getCachedConfig = function() {
  return cachedConfig;
}

exports.load = function load() {
  var e = new EventEmitter();

  if (!cachedConfig) {
    fs.readFile(__dirname + '/config.json', 'utf8', function(err, data) {
      if (err) {
        e.emit('error', err);
      } else {
        cachedConfig = modifyConfig(JSON.parse(data));
        e.emit('ok', cachedConfig);
      }
    });
  } else {
    setTimeout(e.emit.bind(e, 'ok', cachedConfig), 0);
  }

  return e;
}
