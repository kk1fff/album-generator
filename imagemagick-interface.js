var exec = require('child_process').exec,
    EventEmitter = require('events').EventEmitter;

exports.shrinkSize = function shrinkSize(size, fromFile, toFile) {
  var e = new EventEmitter();
  exec('convert "' + fromFile + '" -resize ' + size + 'x' + size + '\\> "' + toFile + '"',
       function (error, stdout, stderr) {
         if (error !== null) {
           console.log('ShrinkSize error: ' + error);
           e.emit('error', error);
         } else {
           e.emit('ok', toFile);
         }
       });
  return e;
}

function formatExifToJson(plainExif) {
  var lineArray = plainExif.split('\n');
  var exif = {};
  lineArray.forEach(function(line) {
    var parsed = line.match(/exif:(\w+)=(.+)/i);
    if (parsed) exif[parsed[1]] = parsed[2];
  });
  return exif;
}

exports.getExif = function getExif(fromFile) {
  var e = new EventEmitter();
  exec('identify -format "%[EXIF:*]" "' + fromFile + '"',
       function(error, stdout, stderr) {
         if (error !== null) {
           console.log('GetExif error: ' + error);
           e.emit('error', error);
         } else {
           e.emit('ok', formatExifToJson(stdout));
         }
       });
  return e;
}
