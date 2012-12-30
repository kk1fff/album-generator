var EventEmitter = require('events').EventEmitter;
    fs           = require('fs');

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

exports.load = function load() {
  var e = new EventEmitter();

  fs.readFile(__dirname + '/config.json', 'utf8', function(err, data) {
    if (err) {
      e.emit('error', err);
    } else {
      e.emit('ok', modifyConfig(JSON.parse(data)));
    }
  });

  return e;
}
