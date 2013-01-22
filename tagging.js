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
    fsQueue        = require('./fs-queue.js'),
    util           = require('./util.js'),
    photoprocessor = require('./photoprocessor.js'),
    template       = require('./template-interface.js'),
    config         = require('./config.js').getConfig(),
    tagMap = {};

function resolveTag() {
  // Sort and remove duplicated item.
  function resolveSingleTag(photo) {
    var prev = null, result = [];
    photo.sort();
    photo.forEach(function(p) {
      if (p != prev) {
        result.push(p);
        prev = p;
      }
    });
    return result;
  }

  Object.keys(tagMap).forEach(function(tag) {
    var photos = tagMap[tag];
    tagMap[tag] = resolveSingleTag(photos);
  });
  return tagMap;
}

function getTagName(tag) {
  return "tag-" + util.getSafeName(tag);
}

function getTagUrl(tag) {
  return config.httpPrefix + "/" + getTagName(tag) + ".html";
}

function generateTagList() {
  var ret = [];

  resolveTag();
  Object.keys(tagMap).forEach(function(tag) {
    ret.push({
      title: tag,
      photos: photoprocessor.getPhotoInfos(tagMap[tag]),
      name: getTagName(tag),
      tagUrl: getTagUrl(tag)
    });
  });
  return ret;
}

exports.getTagName = getTagName;

exports.getTagUrl = getTagUrl;

// For photo page usage
exports.getSimpleProperties = function getSimpleProperties(tagTitleList) {
  var ret = [];
  tagTitleList.forEach(function(t) {
    ret.push({
      title: t,
      name: getTagName(t),
      tagUrl: getTagUrl(t)
    });
  });
  return ret;
}

exports.generateTagPages = function generateTagPages(albums) {
  var tags = generateTagList(),
      generating = 0,
      e = new EventEmitter();

  function onPageGenerated(err) {
    generating--;
    if (err) {
      e.emit('error', err);
    }

    if (generating == 0) {
      e.emit('ok');
    }
  }

  tags.forEach(function(tagItem) {
    var generatingPage = template.generatePage(
      'tag.html',
      {
        tag: tagItem,
        tags: tags,
        page: {
          title: tagItem.title,
          enableTagListOnSidebar: true,
          enableAlbumListOnSidebar: true
        },
        albums: albums
      });
    generating++;
    generatingPage.on('ok', function(page) {
      console.log('Page is generated: ' + tagItem.title);
      if (config.debug) console.log('Page is generated: ' + page);
      fsQueue.writeFile(config.outputDir + "/" + tagItem.name + ".html", page, 'utf8', function(err) {
        onPageGenerated(err);
      });
    });
    generatingPage.on('error', function(err) {
      onPageGenerated(err);
    });
  });
  return e;
}

// Add a photo into a tag.
exports.addTag = function addTag(photoFileName, tag) {
  tagMap[tag] = tagMap[tag] || [];
  tagMap[tag].push(photoFileName);
}

exports.printTags = function printTags() {
  console.log(JSON.stringify(tagMap));
}

exports.getTags = function getTags() {
  return generateTagList();
}
