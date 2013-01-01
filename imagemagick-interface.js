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

// Expose desired exif entry and change the properties name and value to
// human readable values.
function exifFilter(exifSource) {
  // Return the decimal representation of a ratio string, for example:
  // "8/1" -> 8.0
  // "4/3" -> 1.3
  // The number will be a fixed point string number, or pass -1 to numberAfterPoint
  // for arbitery length.
  function parseRatio(ratio, numberAfterPoint) {
    var match = ratio.match(/(\d+)\/?(\d*)/), av;
    numberAfterPoint = numberAfterPoint || 1;
    if (match[2] && match[2].length > 0) {
      av = parseInt(match[1])/parseInt(match[2]);
    } else {
      av = parseInt(match[1]);
    }
    if (numberAfterPoint < 0) {
      return "" + av;
    } else {
      return av.toFixed(numberAfterPoint);
    }
  }

  // Processor is expeced to be function(exifname, exifvalue) and should
  // return an object
  // {
  //   key - readable key. string.
  //   val - readable exif value. string.
  // }
  var processors = {
    "Artist": function(k, v) {
      return {
        key: k,
        val: v
      };
    },
    "FNumber": function(k, v) {
      return {
        key: "Aperture",
        val: "f/" + parseRatio(v)
      };
    },
    "FocalLength": function(k, v) {
      return {
        key: "Focal Length",
        val: parseRatio(v) + " mm"
      };
    },
    "FocalLengthIn35mmFilm": function(k, v) {
      return {
        key: "Focal Length in 35 mm film",
        val: parseRatio(v) + " mm"
      };
    },
    "ExposureTime": function(k, v) {
      return {
        key: "Exposure",
        val: v + " sec"
      };
    },
    "ISOSpeedRatings": function(k, v) {
      return {
        key: "ISO",
        val: v
      }
    },
    "Model": function(k, v) {
      return {
        key: "Model",
        val: v
      };
    }
  };
  var output = {};

  Object.keys(exifSource).forEach(function (exifEntry) {
    // Find processor for the exf entry. If processor isn't available, don't
    // expose this exif property.
    var processor = processors[exifEntry];
    if (processor) {
      var processed = processor(exifEntry, exifSource[exifEntry]);
      output[processed.key] = processed.val;
    }
  });

  return output;
}


function formatExifToJson(plainExif) {
  var lineArray = plainExif.split('\n');
  var exif = {};
  lineArray.forEach(function(line) {
    var parsed = line.match(/exif:(\w+)=(.+)/i);
    if (parsed) exif[parsed[1]] = parsed[2];
  });
  return exifFilter(exif);
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
