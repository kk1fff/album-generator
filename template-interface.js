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

var EventEmitter = require('events').EventEmitter,
    _ = require('underscore'),
    config = null,
    cachedTemplate = {},
    cachedPageParts = {};

function getPageProperties() {
  return {
    site: {
      title: config.siteTitle,
      css: [ config.httpPrefix + "/css/main.css" ],
      js: [ config.httpPrefix + "/js/album.js" ],
      main: config.httpPrefix + "/"
    }
  }
}

// Load template part from file.
function getPageParts(name) {
  var e = new EventEmitter(),
      cached = cachedPageParts[name];

  if (cached) {
    setTimeout(e.emit.bind(e, 'ok', cached), 0);
  } else {
    fs.readFile(config.pagePartDir + "/" + name, 'utf8', function(err, d) {
      if (err) {
        e.emit('error', err);
        return;
      }
      cachedPageParts[name] = d;
      e.emit('ok', d);
    });
  }

  return e;
}

function formFullTemplate(bodyTempleate) {
  var e = new EventEmitter(),
      header,
      footer,
      loadingHeader = getPageParts('header.html'),
      loadingFooter = getPageParts('footer.html');

  function tryFinish() {
    if (header && footer) {
      e.emit('ok', header + bodyTempleate + footer);
    }
  }

  loadingHeader.on('ok', function(data) {
    header = data;
    tryFinish();
  });
  loadingHeader.on('error', function(err) {
    e.emit('error', err);
  });

  loadingFooter.on('ok', function(data) {
    footer = data;
    tryFinish();
  });
  loadingFooter.on('error', function(err) {
    e.emit('error', err);
  });

  return e;
}

exports.generatePage = function generatePage(templateName, data) {
  var e = new EventEmitter(),
      cached = cachedTemplate[templateName],
      renderData;

  // Lazy initialize.
  if (!config) {
    config = require('./config.js').getCachedConfig();
  }

  renderData = _.extend(data, getPageProperties());
  if (cached) {
    setTimeout(e.emit.bind(e, 'ok', cached(renderData)), 0);
  } else {
    fs.readFile(config.templateDir + "/" + templateName, 'utf8', function(err, d) {
      if (err) {
        e.emit('error', err);
        return;
      }
      
      var ee = formFullTemplate(d);
      ee.on('ok', function(templ) {
        cached = _.template(templ);
        cachedTemplate[templateName] = cached;
        e.emit('ok', cached(renderData));
      });
      ee.on('error', function(err) {
        e.emit('error', err);
      });
    });
  }
  return e;
}

