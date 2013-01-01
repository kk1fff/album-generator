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

var allowedEntry = {
  "File Modification Date/Time": false,
  "File Type": true,
  "Make": true,
  "Camera Model Name": true,
  "Software": true,
  "Artist": true,
  "Exposure Time":true,
  "F Number": true,
  "Exposure Program": true,
  "ISO": true,
  "Date/Time Original": true,
  "Create Date": true,
  "Light Source": true,
  "Focal Length": true,
  "Focus Mode": true,
  "White Balance": true,
  "Lens": true,
  "Lens ID": true
};

function formatExifToJson(txt) {
  var lineArray = txt.split('\n');
  var exif = {};
  lineArray.forEach(function(line) {
    var parsed = line.match(/([\w\\\/,\. ]+): (.+)/i);
    if (parsed) {
      var key = parsed[1].trim();
      if (allowedEntry[key]) {
        exif[key] = parsed[2];
      }
    }
  });
  return exif;
}

exports.getExif = function getExif(fromFile) {
  var e = new EventEmitter();
  exec('exiftool "' + fromFile + '"',
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
