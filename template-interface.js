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

var EventEmitter = require('events').EventEmitter,
    _ = require('underscore'),
    config,
    cachedTemplate = {},
    cachedPageParts = {},
    pagePartWaitingQueue = {};

var STATE_ERROR = 0;
var STATE_AVAILABLE = 1;
var STATE_GETTING_TEMPLATE_RAW_FILE = 2;
var STATE_PREPROC_TEMPLATE = 3;
var STATE_BUILDING_PAGE = 4;

var RESULT_OK = 0;
var RESULT_ERROR = 1;
var RESULT_PROCESS_PAGE = 2;

function getPageProperties() {
  return {
    site: {
      title: config.siteTitle,
      css: [ config.httpPrefix + "/css/main.css" ],
      js: [ config.httpPrefix + "/js/album.js" ],
      googleanalystics: config.googleanalystics,
      main: config.httpPrefix + "/",
      disqus: config.disqus
    }
  }
}

// Load template part from file.
function getPageParts(name) {
  var e = new EventEmitter(),
      cached = cachedPageParts[name];

  if (cached) {
    setTimeout(e.emit.bind(e, 'ok', cached), 0);
  } else if (pagePartWaitingQueue[name]) {
    // If somebody is already reading this file, queue the request.
    pagePartWaitingQueue[name].push(e);
  } else {
    pagePartWaitingQueue[name] = [e];
    fs.readFile(config.pagePartDir + "/" + name, 'utf8', function(err, d) {
      // Notify all the waiting event emitter that we got the file (or fail).
      var waiting = pagePartWaitingQueue[name];
      delete pagePartWaitingQueue[name];
      if (err) {
        waiting.forEach(function(e) {
          e.emit('error', err);
        });
        return;
      }
      cachedPageParts[name] = d;
      waiting.forEach(function(e) {
        e.emit('ok', d);
      });
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

function PageGenerator(templateName, data) {
  this.templateName = templateName;
  this.pageData = _.extend(data, getPageProperties());
  this.state = STATE_AVAILABLE;
}

PageGenerator.prototype = {
  generatePage: function() {
    this.emitter = new EventEmitter();
    this.onOperationDone(RESULT_PROCESS_PAGE);
    return this.emitter;
  },

  _buildPage: function _buildPage() {
    var template = _.template(this.preprocessedTemplate);
    delete this.preprocessedTemplate;
    this.resultPage = template(this.pageData);
    this.onOperationDone(RESULT_OK);
  },

  _preprocessTemplate: function _preprocessTemplate() {
    var ee = formFullTemplate(this.rawTemplate),
        self = this;
    delete this.rawTemplate;
    ee.on('ok', function(templ) {
      self.preprocessedTemplate = cachedTemplate[self.templateName] = templ;
      self.onOperationDone(RESULT_OK);
    });
    ee.on('error', function(err) {
      self.onOperationDone(RESULT_ERROR, err);
    });
  },

  _getTemplateRawFile: function _getTemplateRawFile() {
    var cached = cachedTemplate[this.templateName],
        self = this;
    if (cached) {
      this.preprocessedTemplate = cached;
      this.onOperationDone(RESULT_GOT_CACHED_TEMPLATE);
    } else {
      fs.readFile(config.templateDir + "/" + this.templateName,
                  'utf8', function(err, d) {
        if (err) {
          self.onOperationDone(RESULT_ERROR, err);
        } else {
          self.rawTemplate = d;
          self.onOperationDone(RESULT_OK);
        }
      });
    };
  },

  onOperationDone: function(result, err) {
    switch(this.state) {
    case STATE_AVAILABLE:
      if (result == RESULT_PROCESS_PAGE) {
        this.state = STATE_GETTING_TEMPLATE_RAW_FILE;
        setTimeout(this._getTemplateRawFile.bind(this), 0);
      }
      break;
    case STATE_GETTING_TEMPLATE_RAW_FILE:
      if (result == RESULT_OK) {
        this.state = STATE_PREPROC_TEMPLATE;
        setTimeout(this._preprocessTemplate.bind(this), 0);
      } else if (result == RESULT_GOT_CACHED_TEMPLATE) {
        // We can skip preprocessing.
        this.state = STATE_BUILDING_PAGE;
        setTimeout(this._buildPage.bind(this), 0);
      } else {
        this.handleError(err);
      }
      break;
    case STATE_PREPROC_TEMPLATE:
      if (result == RESULT_OK) {
        this.state = STATE_BUILDING_PAGE;
        setTimeout(this._buildPage.bind(this), 0);
      } else {
        this.handleError(err);
      }
      break;
    case STATE_BUILDING_PAGE:
      if (result == RESULT_OK) {
        this.state = STATE_AVAILABLE;
        this.handleSuccess();
      } else {
        this.handleError(err);
      }
      break;
    }
  },

  handleSuccess: function handleSuccess() {
    this.emitter.emit('ok', this.resultPage);
  },

  handleError: function handleError(err) {
    this.emitter.emit('error', err);
  }
};

exports.generatePage = function generatePage(templateName, data) {
  if (!config) config = require('./config.js').getCachedConfig();
  var pageGenerator = new PageGenerator(templateName, data);
  return pageGenerator.generatePage();
}

