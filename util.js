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

var safeChar = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-";

exports.printErr = function printErr(msg, err) {
  console.log((msg || "Error: ") + err);
}

exports.getSafeName = function getSafeName(str) {
  var i, result = "";
  for (i = 0; i < str.length; i++) {
    var ch = str.charAt(i);
    if (safeChar.indexOf(ch) < 0) {
      // not safe chars.
      result += "_" + str.charCodeAt(i) + "_";
    } else {
      result += ch;
    }
  }
  return result;
}
