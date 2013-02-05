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
    fs           = require('fs'),
    _            = require('underscore'),
    fsQueue      = require('./fs-sync.js'),
    config       = require('./config.js').getConfig(),
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
var RESULT_GOT_CACHED_TEMPLATE = 3;

function getPageProperties() {
  return {
    site: {
      title: config.siteTitle,
      css: [ config.httpPrefix + "/css/main.css" ],
      js: [ config.httpPrefix + "/js/album.js" ],
      googleanalystics: config.googleanalystics,
      main: config.httpPrefix + "/",
      disqus: config.disqus,
      facebookapp: config.facebookapp
    }
  };
}

// Load template part from file.
function getPagePart(name, loadedList) {
  var cached = cachedPageParts[name];
  if (cached) return cached;
  try {
    cached = fs.readFileSync(config.pagePartDir + "/" + name, 'utf8');
    // Process inclusion in this page part.
    cached = formatPagePart(cached, loadedList);
    cachedPageParts[name] = cached;
  } catch (err) {
    console.log("unable to load: " + name);
    return "";
  }
  return cached;
}

function formatPagePart(pagePartText, loadedList) {
  var replaced;
  loadedList = loadedList || [];
  do {
    // Reset replaced. If the replacer is called, it will be set true, 
    // and we will have the next round.
    replaced = false;
        
    pagePartText = pagePartText.replace(/<%![\w\. _-]+%>/, function(str) {
      var matching = str.match(/<%!([\w\. _-]+)%>/),
          pagePartName = matching[1].trim(),
          pagePart;
      replaced = true; // Tell outer that we should check again.
      if (loadedList.indexOf(pagePartName) >= 0) {
        // Loop
        console.warn("Inclusion loop: " + pagePartName);
        return "";
      }
      loadedList.push(pagePartName);
      pagePart = getPagePart(pagePartName, loadedList);
      loadedList.pop();
      return pagePart;
    });
  } while(replaced);

  return pagePartText;
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
    try {
      this.resultPage = template(this.pageData);
      this.onOperationDone(RESULT_OK);
    } catch (e) {
      throw e;
      console.error("Error when building template: " + this.templateName + ", " + e);
      this.onOperationDone(RESULT_ERROR, e);
    }
  },

  _preprocessTemplate: function _preprocessTemplate() {
    this.preprocessedTemplate = formatPagePart(this.rawTemplate),
    delete this.rawTemplate;
    this.onOperationDone(RESULT_OK);
  },

  _getTemplateRawFile: function _getTemplateRawFile() {
    var cached = cachedTemplate[this.templateName];
    if (cached) {
      this.preprocessedTemplate = cached;
      this.onOperationDone(RESULT_GOT_CACHED_TEMPLATE);
    } else {
      try {
        this.rawTemplate =
          fs.readFileSync(config.templateDir + "/" + this.templateName, 'utf8');
      } catch (err) {
        this.onOperationDone(RESULT_ERROR, err);
        return;
      }
      this.onOperationDone(RESULT_OK);
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
  var pageGenerator = new PageGenerator(templateName, data);
  return pageGenerator.generatePage();
};

exports.generatePageAndStoreTo = function generatePageAndStoreTo(templateName,
                                                                 targetFile,
                                                                 data) {
  var emitter = new EventEmitter(),
      generatingPage = this.generatePage(templateName, data);
  generatingPage.on('ok', function(page) {
    if (config.debug) console.log('Page is generated: ' + page);
    fsQueue.writeFile(targetFile, page, 'utf8', function(err) {
      if (err) {
        emitter.emit('error', err);
      } else {
        emitter.emit('ok');
      }
    });
  });

  generatingPage.on('error', function(err) {
    emitter.emit('error', err);
  });

  return emitter;
};

